/**
 * Ticket #63: pure audit-row shaping for auth events. Kept separate from the
 * Next/Supabase wiring so the row shape is unit-testable and so it is obvious
 * what reaches `ppg_audit_events`: non-reversible hashes and a coarse handle
 * kind — never the identifier, password, token, or raw IP.
 */

import { createHash } from 'node:crypto'

export type AuthAuditAction =
  | 'login_failed'
  | 'login_throttled'
  | 'change_password_failed'
  | 'change_password_throttled'

export interface AuthAuditDetails {
  identifier?: string
  /** Short non-sensitive reason, e.g. `invalid_credentials` or `handle`. */
  reason?: string
  retryAfterSeconds?: number
}

export interface AuthAuditRow {
  actor_id: null
  action: AuthAuditAction
  target_type: 'auth'
  target_id: string
  details: {
    handle_kind: 'student_id' | 'email' | 'handle' | 'unknown'
    handle_hash: string | null
    ip_hash: string | null
    reason?: string
    retry_after_seconds?: number
  }
}

/** Normalize a login handle for keying (the Zod schema already trims). */
export function normalizeHandle(identifier: string): string {
  return identifier.trim().toLowerCase()
}

/** Coarse, non-identifying classification for the audit details. */
export function classifyHandle(identifier: string): 'student_id' | 'email' | 'handle' {
  const value = normalizeHandle(identifier)
  if (/^\d+$/.test(value)) return 'student_id'
  if (value.includes('@')) return 'email'
  return 'handle'
}

function hashValue(prefix: string, value: string): string {
  return createHash('sha256').update(`${prefix}:${value}`).digest('hex').slice(0, 32)
}

/**
 * Build the exact row inserted into `ppg_audit_events`. `ip` is the resolved
 * client IP (`'unknown'` when no trustworthy header was present).
 */
export function buildAuthAuditRow(
  action: AuthAuditAction,
  details: AuthAuditDetails,
  ip: string,
): AuthAuditRow {
  const handleHash = details.identifier ? hashValue('handle', normalizeHandle(details.identifier)) : null
  const ipHash = ip === 'unknown' ? null : hashValue('ip', ip)
  return {
    actor_id: null,
    action,
    target_type: 'auth',
    target_id: handleHash ?? ipHash ?? 'unknown',
    details: {
      handle_kind: details.identifier ? classifyHandle(details.identifier) : 'unknown',
      handle_hash: handleHash,
      ip_hash: ipHash,
      ...(details.reason ? { reason: details.reason } : {}),
      ...(details.retryAfterSeconds != null
        ? { retry_after_seconds: Math.max(1, Math.ceil(details.retryAfterSeconds)) }
        : {}),
    },
  }
}

const throttleAuditSeen = new Map<string, number>()

/**
 * De-duplicate throttle audit rows: one per key per window instead of one per
 * blocked request (an attacker must not be able to flood the audit stream).
 */
export function shouldAuditThrottle(
  key: string,
  windowSeconds: number,
  now: () => number = Date.now,
): boolean {
  const current = now()
  const expiresAt = throttleAuditSeen.get(key)
  if (expiresAt && expiresAt > current) return false
  throttleAuditSeen.set(key, current + Math.max(1, windowSeconds) * 1000)
  if (throttleAuditSeen.size > 500) {
    for (const [entryKey, until] of throttleAuditSeen) {
      if (until <= current) throttleAuditSeen.delete(entryKey)
    }
  }
  return true
}
