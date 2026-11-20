import { describe, expect, test } from 'vitest'

import {
  ATTENDANCE_XP,
  attendanceRequestSchema,
  buildDraftRows,
  createAttendanceSessionSchema,
  effectiveEarlyBird,
  isAttendanceBehavior,
  localIsoDate,
  rowXp,
  saveAttendanceSchema,
  sessionXpPreview,
  toAttendancePayload,
  updateDraftRow,
  type AttendanceDraftRow,
} from '../../lib/attendance'

const LEARNER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const LEARNER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const SESSION = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

const draft = (overrides: Partial<AttendanceDraftRow> = {}): AttendanceDraftRow => ({
  learnerId: LEARNER_A,
  present: false,
  earlyBird: false,
  behaviorPoints: 0,
  ...overrides,
})

describe('attendance XP math', () => {
  test('present alone is +10', () => {
    expect(rowXp(draft({ present: true }))).toBe(ATTENDANCE_XP.present)
  })

  test('present and early is +10 +5', () => {
    expect(rowXp(draft({ present: true, earlyBird: true }))).toBe(15)
  })

  test('early never counts while absent', () => {
    expect(effectiveEarlyBird(false, true)).toBe(false)
    expect(rowXp(draft({ present: false, earlyBird: true }))).toBe(0)
  })

  test('behaviour adds the chosen 0/5/10', () => {
    expect(rowXp(draft({ behaviorPoints: 5 }))).toBe(5)
    expect(rowXp(draft({ present: true, behaviorPoints: 10 }))).toBe(20)
    expect(rowXp(draft({ present: true, earlyBird: true, behaviorPoints: 10 }))).toBe(25)
  })

  test('the session preview sums every row', () => {
    const rows = [
      draft({ learnerId: LEARNER_A, present: true, earlyBird: true, behaviorPoints: 10 }),
      draft({ learnerId: LEARNER_B, present: true }),
      draft({ present: false, behaviorPoints: 5 }),
    ]
    expect(sessionXpPreview(rows)).toBe(25 + 10 + 5)
  })
})

describe('attendance draft normalisation', () => {
  test('saved records seed the draft; missing learners default to absent', () => {
    const rows = buildDraftRows([LEARNER_A, LEARNER_B], [
      { learner_id: LEARNER_B, present: true, early_bird: true, behavior_points: 10 },
    ])
    expect(rows[0]).toEqual(draft())
    expect(rows[1]).toEqual(draft({ learnerId: LEARNER_B, present: true, earlyBird: true, behaviorPoints: 10 }))
  })

  test('an out-of-range saved behaviour falls back to 0', () => {
    const rows = buildDraftRows([LEARNER_A], [
      { learner_id: LEARNER_A, present: true, early_bird: false, behavior_points: 7 },
    ])
    expect(rows[0].behaviorPoints).toBe(0)
  })

  test('un-ticking present clears early-bird in the same update', () => {
    const before = [draft({ present: true, earlyBird: true })]
    const after = updateDraftRow(before, LEARNER_A, { present: false })
    expect(after[0].present).toBe(false)
    expect(after[0].earlyBird).toBe(false)
  })

  test('the payload normalises early-bird when absent', () => {
    const payload = toAttendancePayload([
      draft({ present: false, earlyBird: true, behaviorPoints: 5 }),
    ])
    expect(payload[0]).toEqual({
      learner_id: LEARNER_A,
      present: false,
      early_bird: false,
      behavior_points: 5,
    })
  })

  test('only 0, 5 and 10 are behaviour values', () => {
    expect(isAttendanceBehavior(0)).toBe(true)
    expect(isAttendanceBehavior(5)).toBe(true)
    expect(isAttendanceBehavior(10)).toBe(true)
    expect(isAttendanceBehavior(7)).toBe(false)
    expect(isAttendanceBehavior('5')).toBe(false)
  })

  test('localIsoDate is always YYYY-MM-DD', () => {
    expect(localIsoDate(new Date(2026, 10, 20))).toBe('2026-11-20')
    expect(localIsoDate(new Date(2026, 0, 3))).toBe('2026-01-03')
  })
})

describe('attendance request schemas', () => {
  test('create accepts a date and chapter key', () => {
    expect(createAttendanceSessionSchema.safeParse({
      action: 'create',
      session_date: '2026-11-20',
      module_key: 'chapter-01',
    }).success).toBe(true)
  })

  test('create rejects a malformed date, module key or extra field', () => {
    expect(createAttendanceSessionSchema.safeParse({
      action: 'create', session_date: '20-11-2026', module_key: 'chapter-01',
    }).success).toBe(false)
    expect(createAttendanceSessionSchema.safeParse({
      action: 'create', session_date: '2026-11-20', module_key: 'lesson-01',
    }).success).toBe(false)
    expect(createAttendanceSessionSchema.safeParse({
      action: 'create', session_date: '2026-11-20', module_key: 'chapter-01', role: 'admin',
    }).success).toBe(false)
  })

  test('save accepts the wire rows and rejects a bad behaviour value', () => {
    const row = { learner_id: LEARNER_A, present: true, early_bird: false, behavior_points: 10 }
    expect(saveAttendanceSchema.safeParse({ action: 'save', session_id: SESSION, rows: [row] }).success).toBe(true)
    expect(saveAttendanceSchema.safeParse({
      action: 'save', session_id: SESSION, rows: [{ ...row, behavior_points: 7 }],
    }).success).toBe(false)
  })

  test('the request union routes by action', () => {
    expect(attendanceRequestSchema.safeParse({ action: 'nope' }).success).toBe(false)
  })
})
