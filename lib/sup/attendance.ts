import 'server-only'

import { createSupaSessionClient } from './sessionClient'

import type { AttendanceOverview, AttendanceSessionRow } from '../attendance'

/**
 * PPGA #141 attendance server module.
 *
 * Every call carries the caller's session JWT (anon key + RLS/the RPC gates),
 * never the service role. The write RPCs re-check the caller's role at the
 * database; the route's `staffGate` is the same check one layer earlier. The
 * page/route never trusts a client-supplied role.
 */

export interface AttendanceReadState {
  status: 'ok' | 'empty' | 'denied' | 'unauthorized' | 'not-configured' | 'error'
  detail?: string
  sessions: AttendanceSessionRow[]
}

export async function readAttendanceOverview(): Promise<AttendanceReadState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing', sessions: [] }

  const { data: session } = await sup.auth.getSession()
  if (!session?.session) return { status: 'unauthorized', detail: 'no session', sessions: [] }

  const { data, error } = await sup.rpc('ppg_attendance_overview', {} as never)
  if (error) {
    const message = error.message.toLowerCase()
    if (message.includes('permission_denied') || message.includes('violates row-level security')) {
      return { status: 'denied', detail: error.message, sessions: [] }
    }
    return { status: 'error', detail: error.message, sessions: [] }
  }

  const payload = (data ?? {}) as AttendanceOverview
  const sessions = Array.isArray(payload.sessions) ? payload.sessions : []
  if (sessions.length === 0) return { status: 'empty', sessions: [] }
  return { status: 'ok', sessions }
}

export interface AttendanceMutationResult {
  ok: boolean
  status?: number
  detail?: string
  session_id?: string
  saved?: number
  present?: number
  early?: number
  behavior_points?: number
  xp_total?: number
  awarded?: { present: number; early: number; behavior: number }
}

export async function createAttendanceSession(input: {
  session_date: string
  module_key: string
  label_th?: string
  label_en?: string
}): Promise<AttendanceMutationResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, status: 500, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session?.session) return { ok: false, status: 401, detail: 'unauthorized' }

  const { data, error } = await sup.rpc(
    'ppg_create_attendance_session',
    {
      p_session_date: input.session_date,
      p_module_key: input.module_key,
      p_label_th: input.label_th ?? null,
      p_label_en: input.label_en ?? null,
    } as never,
  )

  if (error) return mutationError(error.message)

  const payload = (data ?? {}) as { session_id?: string }
  return { ok: payload.session_id != null, session_id: payload.session_id }
}

export async function saveAttendance(input: {
  session_id: string
  rows: Array<{
    learner_id: string
    present: boolean
    early_bird: boolean
    behavior_points: number
  }>
}): Promise<AttendanceMutationResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, status: 500, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session?.session) return { ok: false, status: 401, detail: 'unauthorized' }

  const { data, error } = await sup.rpc(
    'ppg_save_attendance',
    { p_session_id: input.session_id, p_rows: input.rows } as never,
  )

  if (error) return mutationError(error.message)

  return { ...(data as AttendanceMutationResult), ok: true }
}

function mutationError(message: string): AttendanceMutationResult {
  const lower = message.toLowerCase()
  if (lower.includes('permission_denied')) return { ok: false, status: 403, detail: message }
  if (lower.includes('forbidden_target')) return { ok: false, status: 403, detail: message }
  if (
    lower.includes('session_required') ||
    lower.includes('session_missing') ||
    lower.includes('module_required') ||
    lower.includes('module_missing') ||
    lower.includes('rows_required') ||
    lower.includes('rows_denied') ||
    lower.includes('row_denied') ||
    lower.includes('learner_required') ||
    lower.includes('behavior_denied') ||
    lower.includes('session_date_required')
  ) {
    return { ok: false, status: 400, detail: message }
  }
  return { ok: false, status: 500, detail: message }
}
