import { z } from 'zod'

/**
 * PPGA #141 teacher attendance & behaviour: pure logic.
 *
 * This module is deliberately outside `server-only`: the API route validates
 * with the same schemas the client uses, and the XP preview / row
 * normalisation are unit-tested directly. The database's definer RPCs remain
 * the authority (there is no client write path); these helpers only shape the
 * request and the optimistic preview.
 */

export const ATTENDANCE_BEHAVIOR_VALUES = [0, 5, 10] as const
export type AttendanceBehavior = (typeof ATTENDANCE_BEHAVIOR_VALUES)[number]

export const ATTENDANCE_XP = {
  present: 10,
  early: 5,
} as const

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const DATE = /^\d{4}-\d{2}-\d{2}$/
const MODULE_KEY = /^(module|chapter)-\d{2}$/

/** One roster row as the teacher edits it. */
export interface AttendanceDraftRow {
  learnerId: string
  present: boolean
  earlyBird: boolean
  behaviorPoints: AttendanceBehavior
}

/** One row as the RPC/overview returns it (snake_case wire shape). */
export interface AttendanceRecordRow {
  learner_id: string
  present: boolean
  early_bird: boolean
  behavior_points: number
}

export interface AttendanceSessionRow {
  id: string
  module_key: string
  session_date: string
  label_th: string | null
  label_en: string | null
  present_count: number
  early_count: number
  behavior_total: number
  xp_total: number
  records: AttendanceRecordRow[]
}

export interface AttendanceOverview {
  sessions: AttendanceSessionRow[]
}

export const createAttendanceSessionSchema = z
  .object({
    action: z.literal('create'),
    session_date: z.string().regex(DATE),
    module_key: z.string().regex(MODULE_KEY),
    label_th: z.string().trim().max(120).optional(),
    label_en: z.string().trim().max(120).optional(),
  })
  .strict()

export const attendanceRowSchema = z
  .object({
    learner_id: z.string().regex(UUID),
    present: z.boolean(),
    early_bird: z.boolean(),
    behavior_points: z.union([z.literal(0), z.literal(5), z.literal(10)]),
  })
  .strict()

export const saveAttendanceSchema = z
  .object({
    action: z.literal('save'),
    session_id: z.string().regex(UUID),
    rows: z.array(attendanceRowSchema).max(500),
  })
  .strict()

export const attendanceRequestSchema = z.discriminatedUnion('action', [
  createAttendanceSessionSchema,
  saveAttendanceSchema,
])

export type AttendanceRequest = z.infer<typeof attendanceRequestSchema>

export function isAttendanceBehavior(value: unknown): value is AttendanceBehavior {
  return value === 0 || value === 5 || value === 10
}

/** Early-bird only counts while present; the UI disables the control and the
 * database carries the same CHECK. */
export function effectiveEarlyBird(present: boolean, earlyBird: boolean): boolean {
  return present && earlyBird
}

/** The XP one roster row is worth under the shared award table. The database
 * grants each component once per session, so this is also the ceiling a
 * session can award. */
export function rowXp(row: Pick<AttendanceDraftRow, 'present' | 'earlyBird' | 'behaviorPoints'>): number {
  const present = row.present ? ATTENDANCE_XP.present : 0
  const early = effectiveEarlyBird(row.present, row.earlyBird) ? ATTENDANCE_XP.early : 0
  return present + early + row.behaviorPoints
}

/** The live per-session XP preview the form shows before saving. */
export function sessionXpPreview(rows: readonly AttendanceDraftRow[]): number {
  return rows.reduce((total, row) => total + rowXp(row), 0)
}

/** The array the save route sends: snake_case, early-bird normalised. */
export function toAttendancePayload(rows: readonly AttendanceDraftRow[]) {
  return rows.map((row) => ({
    learner_id: row.learnerId,
    present: row.present,
    early_bird: effectiveEarlyBird(row.present, row.earlyBird),
    behavior_points: row.behaviorPoints,
  }))
}

/** Seed the editor: saved records win, every other learner gets the empty
 * default (absent, no early bird, zero behaviour). Unknown/retired learner ids
 * in a saved record are ignored because the roster is the authority. */
export function buildDraftRows(
  rosterIds: readonly string[],
  saved: readonly AttendanceRecordRow[],
): AttendanceDraftRow[] {
  const byId = new Map(saved.map((record) => [record.learner_id, record]))
  return rosterIds.map((learnerId) => {
    const record = byId.get(learnerId)
    return {
      learnerId,
      present: record?.present === true,
      earlyBird: record?.early_bird === true,
      behaviorPoints: isAttendanceBehavior(record?.behavior_points) ? record.behavior_points : 0,
    }
  })
}

/** Replace one row immutably; un-ticking present always clears early-bird. */
export function updateDraftRow(
  rows: readonly AttendanceDraftRow[],
  learnerId: string,
  patch: Partial<Pick<AttendanceDraftRow, 'present' | 'earlyBird' | 'behaviorPoints'>>,
): AttendanceDraftRow[] {
  return rows.map((row) => {
    if (row.learnerId !== learnerId) return row
    const next = { ...row, ...patch }
    return {
      ...next,
      behaviorPoints: isAttendanceBehavior(next.behaviorPoints) ? next.behaviorPoints : 0,
      earlyBird: effectiveEarlyBird(next.present, next.earlyBird),
    }
  })
}

/** Apply one patch to a set of rows (the roster's "select all present"
 * toggle). Every touched row goes through `updateDraftRow`, so un-ticking
 * present clears early-bird and behaviour values stay as they were. */
export function updateDraftRows(
  rows: readonly AttendanceDraftRow[],
  learnerIds: readonly string[],
  patch: Partial<Pick<AttendanceDraftRow, 'present' | 'earlyBird' | 'behaviorPoints'>>,
): AttendanceDraftRow[] {
  const targets = new Set(learnerIds)
  return rows.map((row) =>
    targets.has(row.learnerId) ? updateDraftRow([row], row.learnerId, patch)[0] : row,
  )
}

/** Local YYYY-MM-DD (not UTC) for the create form's default date. */
export function localIsoDate(now: Date = new Date()): string {
  const year = now.getFullYear()
  const month = String(now.getMonth() + 1).padStart(2, '0')
  const day = String(now.getDate()).padStart(2, '0')
  return `${year}-${month}-${day}`
}
