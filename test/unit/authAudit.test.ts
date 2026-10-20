import { describe, expect, test } from 'vitest'
import { readFileSync, readdirSync } from 'node:fs'
import { join } from 'node:path'

import { buildAuthAuditRow, classifyHandle, normalizeHandle, shouldAuditThrottle } from '../../lib/authAudit'

/**
 * Ticket #63: the audit row must land in `ppg_audit_events` without any
 * secret/sensitive material. The row shape is asserted directly, and a static
 * pass asserts that every mutating handler carries the Origin gate and both
 * auth routes carry the limiter + audit wiring.
 */
const base = process.cwd()
const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

function routeFiles(dir: string): string[] {
  const out: string[] = []
  for (const entry of readdirSync(join(base, dir), { withFileTypes: true })) {
    const rel = join(dir, entry.name)
    if (entry.isDirectory()) out.push(...routeFiles(rel))
    else if (entry.name === 'route.ts') out.push(rel)
  }
  return out
}

describe('auth audit row', () => {
  test('failed login: hashed identifier, coarse kind, no raw values', () => {
    const row = buildAuthAuditRow(
      'login_failed',
      { identifier: '64110001', reason: 'invalid_credentials' },
      '203.0.113.9',
    )

    expect(row.actor_id).toBeNull()
    expect(row.action).toBe('login_failed')
    expect(row.target_type).toBe('auth')
    expect(row.details.handle_kind).toBe('student_id')
    expect(row.details.handle_hash).toMatch(/^[0-9a-f]{32}$/)
    expect(row.details.ip_hash).toMatch(/^[0-9a-f]{32}$/)
    expect(row.details.reason).toBe('invalid_credentials')

    const serialized = JSON.stringify(row)
    expect(serialized.includes('64110001')).toBe(false)
    expect(serialized.includes('203.0.113.9')).toBe(false)
  })

  test('throttle event: retry_after is a positive whole second count', () => {
    const row = buildAuthAuditRow('login_throttled', { identifier: '64110001', reason: 'handle', retryAfterSeconds: 42.2 }, 'unknown')
    expect(row.action).toBe('login_throttled')
    expect(row.details.retry_after_seconds).toBe(43)
    expect(row.details.ip_hash).toBeNull()
  })

  test('no identifier: classification is unknown and the IP hashes the target', () => {
    const row = buildAuthAuditRow('change_password_throttled', { reason: 'ip' }, '198.51.100.4')
    expect(row.details.handle_kind).toBe('unknown')
    expect(row.details.handle_hash).toBeNull()
    expect(row.target_id).toMatch(/^[0-9a-f]{32}$/)
  })

  test('handle normalization + classification', () => {
    expect(normalizeHandle('  Admin ')).toBe('admin')
    expect(classifyHandle('64110001')).toBe('student_id')
    expect(classifyHandle('teacher@ppga.local')).toBe('email')
    expect(classifyHandle('teacher')).toBe('handle')
  })

  test('throttle audit is de-duplicated per key per window', () => {
    let clock = 1_000
    const now = () => clock
    expect(shouldAuditThrottle('login:handle:64110001', 60, now)).toBe(true)
    expect(shouldAuditThrottle('login:handle:64110001', 60, now)).toBe(false)
    // A different key is independent.
    expect(shouldAuditThrottle('login:ip:203.0.113.9', 60, now)).toBe(true)
    // Once the window passes, the same key may be audited again.
    clock += 61_000
    expect(shouldAuditThrottle('login:handle:64110001', 60, now)).toBe(true)
  })
})

describe('route wiring (static)', () => {
  test('every mutating API handler carries the Origin gate', () => {
    const files = routeFiles('app/api').filter((file) =>
      /export async function (POST|PUT|PATCH|DELETE)\(/.test(read(file)),
    )

    expect(files.length).toBeGreaterThan(10)
    for (const file of files) {
      const source = read(file)
      expect(source.includes('rejectCrossOrigin(req)'), `${file} lacks the Origin gate`).toBe(true)
    }
  })

  test('login and change-password are throttled and audited', () => {
    const login = read('app/api/auth/login/route.ts')
    expect(login.includes("getAuthLimiters('login')")).toBe(true)
    expect(login.includes('throttledResponse')).toBe(true)
    expect(login.includes("'login_failed'")).toBe(true)
    expect(login.includes("'login_throttled'")).toBe(true)
    expect(login.includes('limits.handle.reset')).toBe(true)
    expect(login.includes('limits.ip.reset')).toBe(true)

    const change = read('app/api/auth/change-password/route.ts')
    expect(change.includes("getAuthLimiters('change-password')")).toBe(true)
    expect(change.includes('throttledResponse')).toBe(true)
    expect(change.includes("'change_password_failed'")).toBe(true)
    expect(change.includes("'change_password_throttled'")).toBe(true)
  })

  test('audit writes go through the service-role client to ppg_audit_events', () => {
    const guard = read('lib/authGuard.ts')
    expect(guard.includes('createSupabaseServerClient')).toBe(true)
    expect(guard.includes("from('ppg_audit_events')")).toBe(true)
    // The best-effort contract: a failed insert is caught, never thrown.
    expect(guard.includes('catch')).toBe(true)
  })

  test('the 429 carries Retry-After and the same body for every caller', () => {
    const guard = read('lib/authGuard.ts')
    expect(guard.includes("'Retry-After'")).toBe(true)
    expect(guard.includes('too many attempts')).toBe(true)
  })
})
