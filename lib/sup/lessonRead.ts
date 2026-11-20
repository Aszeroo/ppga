import 'server-only'

import { createSupaSessionClient } from './sessionClient'

/**
 * PPGA #141 lesson read claim server read/write.
 *
 * `readOwnLessonReadAward` is the revisit read: the caller's OWN ledger row
 * (the `ppg_xp_ledger_select` policy limits it to the caller) for this
 * lesson. `claimLessonReadViaRpc` calls the database's definer; the RPC
 * re-checks the lesson's visibility, so a closed gate or a locked lesson is
 * denied there, never merely hidden in the UI.
 */

export interface LessonReadClaimResult {
  status: 'ok' | 'already' | 'denied' | 'unauthorized' | 'not-configured' | 'error'
  detail?: string
  awarded?: boolean
  amount?: number
  total?: number
}

export async function readOwnLessonReadAward(lessonKey: string): Promise<boolean> {
  const sup = await createSupaSessionClient()
  if (!sup) return false

  const { data: session } = await sup.auth.getSession()
  const uid = session?.session?.user?.id
  if (!uid) return false

  const { data, error } = await sup
    .from('ppg_xp_ledger')
    .select('event_ref')
    .eq('learner_id', uid)
    .eq('event_type', 'lesson_read')
    .eq('event_ref', lessonKey)
    .limit(1)

  if (error) return false
  return Array.isArray(data) && data.length > 0
}

export async function claimLessonReadViaRpc(lessonKey: string): Promise<LessonReadClaimResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session?.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup.rpc(
    'ppg_mark_lesson_read',
    { p_lesson_key: lessonKey } as never,
  )

  if (error) {
    const message = error.message.toLowerCase()
    if (
      message.includes('permission_denied') ||
      message.includes('gate_closed') ||
      message.includes('lesson_not_visible') ||
      message.includes('lesson_denied')
    ) {
      return { status: 'denied', detail: error.message }
    }
    return { status: 'error', detail: error.message }
  }

  const payload = (data ?? {}) as {
    awarded?: boolean
    already?: boolean
    amount?: number
    total?: number
  }
  if (payload.awarded === true) {
    return { status: 'ok', awarded: true, amount: payload.amount ?? 20, total: payload.total }
  }
  if (payload.already === true) {
    return { status: 'already', awarded: false, amount: 0, total: payload.total }
  }
  return { status: 'error', detail: 'unexpected_rpc_payload' }
}
