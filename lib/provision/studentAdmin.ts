import { z } from 'zod'

/**
 * Teacher/Admin student-management pure logic — the validation + the
 * caller/target role guard live here (outside `server-only`, exactly like
 * `lib/provision/roster.ts`) so the unit tests can import them verbatim and
 * the client dialog can validate with the SAME schema the route enforces.
 *
 * The handle (the login identifier) is the #3 scheme: a learner signs in with
 * their student-ID, which maps to `<handle>@ppga.local`. The canonical form is
 * lower-case, 3–50 chars, `a-z 0-9 . _ -`; the schema normalises case and
 * whitespace before validating, matching the provisioning paste's own
 * lower-casing. The display name is 1–80 chars after trimming.
 */

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const HANDLE = /^[a-z0-9._-]+$/

/** The canonical login handle: trimmed + lower-cased, then the #3 shape. */
export const learnerHandleSchema = z
  .string()
  .transform((value) => value.trim().toLowerCase())
  .pipe(z.string().min(3).max(50).regex(HANDLE))

/** The learner's display name: trimmed, 1–80 chars. */
export const learnerNameSchema = z.string().trim().min(1).max(80)

export const studentUuidSchema = z.string().regex(UUID)

/** The edit dialog's body — the profile id (not trusted as a role; the route
 * re-reads the target profile and refuses a non-learner) + the two editable
 * fields. No role field exists anywhere: a caller can never smuggle one. */
export const editLearnerSchema = z
  .object({
    target_id: studentUuidSchema,
    student_id: learnerHandleSchema,
    full_name: learnerNameSchema,
  })
  .strict()

/** The reset/delete bodies: the target profile id alone. */
export const targetLearnerSchema = z
  .object({
    target_id: studentUuidSchema,
  })
  .strict()

export type EditLearnerInput = z.infer<typeof editLearnerSchema>

/** The list row the server reads and the client renders. */
export interface LearnerRow {
  id: string
  student_id: string
  full_name: string
  consent: boolean
}

export type StaffRole = 'teacher' | 'admin'
export type TargetRole = 'learner' | 'teacher' | 'admin'

export type StudentMutationOutcome = 'ok' | 'denied' | 'forbidden_target'

/** The staff role a caller's PROFILE row must carry. The route reads the
 * caller's own profile through the session JWT and passes its role here —
 * never a client-supplied role. A learner (or an absent/undecodable role)
 * is denied. */
export function isStaffRole(role: string | null | undefined): role is StaffRole {
  return role === 'teacher' || role === 'admin'
}

/** The one decision table every mutation route shares: the caller must be
 * staff AND the target's PROFILE role must be `learner`. Staff targets
 * (teacher/admin) are never actionable, even for an admin caller, so a
 * stray click can never reset or delete a colleague's account. */
export function guardStudentMutation(
  callerRole: string | null | undefined,
  targetRole: string | null | undefined,
): StudentMutationOutcome {
  if (!isStaffRole(callerRole)) return 'denied'
  if (targetRole !== 'learner') return 'forbidden_target'
  return 'ok'
}

/** The client-side list filter: case-insensitive over full name AND student
 * ID. Pure so the behaviour is unit-tested rather than eyeballed. */
export function filterLearners(rows: readonly LearnerRow[], query: string): LearnerRow[] {
  const needle = query.trim().toLowerCase()
  if (needle === '') return [...rows]
  return rows.filter(
    (row) =>
      row.full_name.toLowerCase().includes(needle) ||
      row.student_id.toLowerCase().includes(needle),
  )
}
