import { test, expect } from 'vitest'

import { parseRoster, genTempPassword, syntheticEmail } from '../../lib/provision/roster'

/**
 * Ticket #7 unit tests (pure logic — run in CI with no Supabase/Postgres
 * credentials): the roster parser classifies every line — a valid line
 * (`student-id + name`, tolerant of separators: a tab, a comma, or
 * whitespace), a within-paste duplicate (the same student ID twice), a
 * malformed line (a missing name / a handle that fails the #3 regex), and a
 * blank line (skipped, not a line); the temp password is 12 chars from the
 * ambiguous-free alphabet (`O0`/`Il1` never land), and the synthetic email
 * maps the handle back verbatim (`<handle>@ppga.local`).
 */
const roster = (text: string) => parseRoster(text)

test('roster parser: valid lines classify as created', () => {
  const out = roster('64110001 Lew A. Boonthi\n64110002 Sam B. Boonthee')
  expect(out.length).toBe(2)
  expect(out.some((l) => l.result === 'created')).toBe(true)
  expect(out.some((l) => l.student_id === '64110001')).toBe(true)
})

test('roster parser: comma/tab separators classify as created (tolerant)', () => {
  const out = roster('64110001, Lew A. Boonthi\n64110002\tSam B. Boonthee')
  expect(out.length).toBe(2)
  for (const l of out) expect(l.result === 'created').toBe(true)
  expect(out.some((l) => l.full_name.startsWith('Lew') || l.full_name.startsWith('Sam'))).toBe(true)
})

test('roster parser: within-paste duplicate line (same ID twice)', () => {
  const out = roster('64110001 Lew A. Boonthi\n64110001 Lew A. Boonthi again')
  expect(out.filter((l) => l.result === 'duplicate').length).toBe(1)
  expect(out.filter((l) => l.result === 'created').length).toBe(1)
})

test('roster parser: malformed line (no name / fails the handle regex)', () => {
  const out = roster('64110001 \nbad-handle! Lew')
  expect(out.some((l) => l.result === 'malformed')).toBe(true)
  expect(out.some((l) => l.student_id === 'bad-handle!')).toBe(true)
})

test('roster parser: blank line skipped (not a line)', () => {
  const out = roster('\n\n64110001 Lew A. Boonthi')
  expect(out.length).toBe(1)
  expect(out.some((l) => l.student_id === '64110001')).toBe(true)
})

test('temp password: 12 chars, ambiguous-free alphabet (O0/Il1 never land)', () => {
  for (let i = 0; i < 20; i++) {
    const pwd = genTempPassword()
    expect(pwd.length).toBe(12)
    expect(!/[Oo0lI1]/.test(pwd)).toBe(true)
    expect(/[A-Z]/.test(pwd)).toBe(true)
    expect(/[0-9]/.test(pwd)).toBe(true)
    expect(/[#$%&*]/.test(pwd)).toBe(true)
    expect(pwd.length >= 8 && pwd.length <= 72).toBe(true)
  }
})

test('synthetic email: handle maps back verbatim (#3 scheme re-used)', () => {
  expect(syntheticEmail('64110001')).toBe('64110001@ppga.local')
  expect(syntheticEmail('teacher')).toBe('teacher@ppga.local')
})
