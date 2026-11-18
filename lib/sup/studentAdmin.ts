import 'server-only'

import { createSupaSessionClient } from './sessionClient'
import { createSupaServiceClient } from './provision'
import { genTempPassword, syntheticEmail } from '../provision/roster'
import {
  guardStudentMutation,
  isStaffRole,
  type LearnerRow,
  type StaffRole,
} from '../provision/studentAdmin'

/**
 * Teacher/Admin student management server module.
 *
 * Authority split, deliberately the same as provisioning (#7):
 * - Every read/list and the CALLER's role come from the request's Supabase
 *   session JWT through the anon-key client + RLS (`ppg_profiles_select` lets
 *   a teacher/admin see every profile; a learner sees only their own row).
 *   A client-supplied role is never consulted.
 * - The Auth ADMIN API (`createUser`, `updateUserById`, `deleteUser`) and the
 *   cross-user profile UPDATE can only run with the service-role key. That is
 *   the SAME legitimate service-role use provisioning already documents: the
 *   key stays server-side in this `server-only` module, and every caller has
 *   already cleared the JWT profile-role gate below.
 * - The TARGET's role is re-read from `ppg_profiles` on every mutation; a
 *   non-`learner` target is refused before any auth write, so a staff account
 *   can never be reset, renamed, or deleted through this surface.
 *
 * Audit: every successful edit/reset/delete writes exactly one row to
 * `ppg_audit_events` (provisioning already audits its own lines). Password
 * material never enters the audit details.
 */

export interface StaffGate {
  kind: 'ok' | 'denied' | 'unauthorized' | 'not-configured'
  role?: StaffRole
  userId?: string
}

/** The caller's profile role, read with the session JWT (never a body field).
 * A learner's own-row read succeeds at the RLS level but fails this gate. */
export async function staffGate(): Promise<StaffGate> {
  const sup = await createSupaSessionClient()
  if (!sup) return { kind: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  const userId = session.session?.user?.id
  if (!userId) return { kind: 'unauthorized' }

  const { data, error } = await sup
    .from('ppg_profiles')
    .select('role')
    .eq('id', userId)
    .limit(1)

  if (error || !data || data.length === 0) return { kind: 'denied' }
  const role = data[0].role as string | undefined
  if (!isStaffRole(role)) return { kind: 'denied' }
  return { kind: 'ok', role, userId }
}

export interface LearnerListState {
  status: 'ok' | 'empty' | 'denied' | 'unauthorized' | 'not-configured' | 'error'
  detail?: string
  rows?: LearnerRow[]
}

/** Every learner, ordered by student id. The caller must be staff (checked
 * through the session JWT); RLS then decides which rows exist. The UI needs
 * no pagination at class scale, so this reads the whole (small) table. */
export async function listLearners(): Promise<LearnerListState> {
  const gate = await staffGate()
  if (gate.kind !== 'ok') {
    return {
      status: gate.kind === 'not-configured' ? 'not-configured' : gate.kind,
      detail: gate.kind === 'denied' ? 'student management is teacher/admin-only' : undefined,
    }
  }

  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured' }

  const { data, error } = await sup
    .from('ppg_profiles')
    .select('id, student_id, full_name, role, consent')
    .eq('role', 'learner')
    .order('student_id', { ascending: true })
    .limit(1000)

  if (error) return { status: 'error', detail: error.message }
  const rows = (data ?? []).map((row: {
    id: string
    student_id: string
    full_name: string
    consent: boolean | null
  }) => ({
    id: row.id,
    student_id: row.student_id,
    full_name: row.full_name,
    consent: Boolean(row.consent),
  }))

  if (rows.length === 0) return { status: 'empty', detail: 'no learner profiles' }
  return { status: 'ok', rows }
}

interface TargetProfile {
  id: string
  student_id: string
  full_name: string
  role: string
}

/** The mutation services' shared pre-flight: read the target through the
 * service client (a cross-user read the caller's RLS does not need to grant),
 * then apply the ONE guard table. Callers pass the caller role their JWT
 * profile read produced; the target role comes from the DB row. */
async function readGuardTarget(
  callerRole: StaffRole | undefined,
  targetId: string,
): Promise<{ ok: true; sup: NonNullable<ReturnType<typeof createSupaServiceClient>>; target: TargetProfile } | { ok: false; detail: string }> {
  const sup = createSupaServiceClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data, error } = await sup
    .from('ppg_profiles')
    .select('id, student_id, full_name, role')
    .eq('id', targetId)
    .limit(1)

  if (error) return { ok: false, detail: 'error' }
  if (!data || data.length === 0) return { ok: false, detail: 'target_missing' }

  const target = data[0] as TargetProfile
  const verdict = guardStudentMutation(callerRole, target.role)
  if (verdict !== 'ok') return { ok: false, detail: verdict }
  return { ok: true, sup, target }
}

type AuditAction = 'student_edit' | 'student_password_reset' | 'student_delete'

/** Exactly one append-only audit row per successful mutation. Best-effort in
 * the transport sense (a failed insert does not undo the completed mutation)
 * but the boolean is reported so a caller never claims an audit that did not
 * land. No password material ever reaches `details`. */
async function insertStudentAudit(
  sup: NonNullable<ReturnType<typeof createSupaServiceClient>>,
  actorId: string,
  action: AuditAction,
  studentId: string,
  details: Record<string, string>,
): Promise<boolean> {
  const { error } = await sup.from('ppg_audit_events').insert({
    actor_id: actorId,
    action,
    target_type: 'account',
    target_id: studentId,
    details,
  } as never)
  return !error
}

export interface StudentMutationResult {
  ok: boolean
  detail?: string
  status?: number
  /** Reset only: the one-time temp password (never persisted in plain text). */
  temp_password?: string
  audit?: boolean
}

/** Auth-service error → the stable detail the UI maps to copy. */
function mapAuthError(message: string | undefined, fallback: string): string {
  const lower = (message ?? '').toLowerCase()
  if (lower.includes('already') || lower.includes('registered') || lower.includes('duplicate')) {
    return 'handle_taken'
  }
  if (lower.includes('not found')) return 'target_missing'
  return fallback
}

/**
 * Edit a learner's display name and login handle.
 *
 * Order matters for the "change nothing on conflict" promise:
 * 1. Pre-check the profile-handle uniqueness.
 * 2. If the handle changes, update the synthetic auth email FIRST (the Auth
 *    service is the final uniqueness authority). A failure here returns
 *    without touching the profile.
 * 3. Update `student_id` + `full_name` on the profile (role untouched). If
 *    that write fails, roll the auth email back to the old handle.
 */
export async function editLearner(
  callerRole: StaffRole | undefined,
  actorId: string | undefined,
  targetId: string,
  studentId: string,
  fullName: string,
): Promise<StudentMutationResult> {
  const guarded = await readGuardTarget(callerRole, targetId)
  if (!guarded.ok) return { ok: false, detail: guarded.detail, status: 403 }
  const { sup, target } = guarded

  const handleChanged = target.student_id !== studentId

  if (handleChanged) {
    const { data: clash, error: clashError } = await sup
      .from('ppg_profiles')
      .select('id')
      .eq('student_id', studentId)
      .neq('id', targetId)
      .limit(1)
    if (clashError) return { ok: false, detail: 'error', status: 500 }
    if (clash && clash.length > 0) return { ok: false, detail: 'handle_taken', status: 409 }

    // Merge the existing metadata so the trigger's raw-material stays whole;
    // the profile row remains the authority for role/consent/flags.
    const { data: authData } = await sup.auth.admin.getUserById(targetId)
    const existingMeta = (authData?.user?.user_metadata ?? {}) as Record<string, unknown>
    const { error: authError } = await sup.auth.admin.updateUserById(targetId, {
      email: syntheticEmail(studentId),
      email_confirm: true,
      user_metadata: {
        ...existingMeta,
        student_id: studentId,
        full_name: fullName,
      },
    })
    if (authError) {
      return {
        ok: false,
        detail: mapAuthError(authError.message, 'error'),
        status: authError.message.toLowerCase().includes('already') ? 409 : 500,
      }
    }
  }

  // Only the two editable columns — role is never in this update.
  const { error: profileError } = await sup
    .from('ppg_profiles')
    .update({ student_id: studentId, full_name: fullName } as never)
    .eq('id', targetId)

  if (profileError) {
    if (handleChanged) {
      // Best-effort rollback keeps the auth email and profile handle aligned.
      await sup.auth.admin.updateUserById(targetId, {
        email: syntheticEmail(target.student_id),
        email_confirm: true,
      })
    }
    const detail = profileError.message.toLowerCase().includes('duplicate')
      ? 'handle_taken'
      : 'error'
    return { ok: false, detail, status: detail === 'handle_taken' ? 409 : 500 }
  }

  const audit = actorId
    ? await insertStudentAudit(sup, actorId, 'student_edit', studentId, {
      target_profile_id: targetId,
      old_student_id: target.student_id,
      new_student_id: studentId,
      old_full_name: target.full_name,
      new_full_name: fullName,
    })
    : false

  return { ok: true, audit }
}

/** Reset a learner's password to a fresh one-time temp password. The profile
 * flag is set first so a learner's next login is forced to /change-password;
 * if the Auth update then fails the flag is rolled back. */
export async function resetLearnerPassword(
  callerRole: StaffRole | undefined,
  actorId: string | undefined,
  targetId: string,
): Promise<StudentMutationResult> {
  const guarded = await readGuardTarget(callerRole, targetId)
  if (!guarded.ok) return { ok: false, detail: guarded.detail, status: 403 }
  const { sup, target } = guarded

  const { data: flagRow, error: flagReadError } = await sup
    .from('ppg_profiles')
    .select('must_change_password')
    .eq('id', targetId)
    .limit(1)
  if (flagReadError) return { ok: false, detail: 'error', status: 500 }
  const previousFlag = Boolean(flagRow?.[0]?.must_change_password)

  const { error: flagError } = await sup
    .from('ppg_profiles')
    .update({ must_change_password: true } as never)
    .eq('id', targetId)
  if (flagError) return { ok: false, detail: 'error', status: 500 }

  const temp = genTempPassword()
  const { error: authError } = await sup.auth.admin.updateUserById(targetId, {
    password: temp,
  })
  if (authError) {
    await sup
      .from('ppg_profiles')
      .update({ must_change_password: previousFlag } as never)
      .eq('id', targetId)
    return { ok: false, detail: mapAuthError(authError.message, 'error'), status: 500 }
  }

  const audit = actorId
    ? await insertStudentAudit(sup, actorId, 'student_password_reset', target.student_id, {
      target_profile_id: targetId,
      student_id: target.student_id,
      full_name: target.full_name,
    })
    : false

  return { ok: true, temp_password: temp, audit }
}

/** Permanently delete a learner's auth user. `ppg_profiles` and every answer/
 * XP/award row cascade from `auth.users`, so this is the research-data
 * deletion the confirmation dialog states plainly. The guard runs first, so
 * a staff account can never be deleted through this surface. */
export async function deleteLearner(
  callerRole: StaffRole | undefined,
  actorId: string | undefined,
  targetId: string,
): Promise<StudentMutationResult> {
  const guarded = await readGuardTarget(callerRole, targetId)
  if (!guarded.ok) return { ok: false, detail: guarded.detail, status: 403 }
  const { sup, target } = guarded

  const { error } = await sup.auth.admin.deleteUser(targetId, false)
  if (error) return { ok: false, detail: mapAuthError(error.message, 'error'), status: 500 }

  // The audit row's target_id is the deleted handle (no FK keeps the stream
  // append-only across the account's retirement); the actor is the caller,
  // who still exists.
  const audit = actorId
    ? await insertStudentAudit(sup, actorId, 'student_delete', target.student_id, {
      target_profile_id: targetId,
      student_id: target.student_id,
      full_name: target.full_name,
    })
    : false

  return { ok: true, audit }
}
