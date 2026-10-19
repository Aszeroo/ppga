import 'server-only'

import { createSupaSessionClient } from './sessionClient'

/**
 * Ticket #43 (#41 stage 2) dashboard-hub reads: the compact player-status
 * summary's REAL rows — the learner's OWN mission completions, the learner's
 * OWN submissions (status + the Teacher's verdict/feedback stored on the
 * round), and the practical-mission module set (which module's Mission is the
 * upload kind). Every read is a plain SELECT through the caller's session JWT:
 * the DATABASE's own RLS decides the rows (a learner sees only their own
 * mission/submission rows — the shipped SELECT policies), never a service-role
 * bypass, never a browser smuggle. These are READ-ONLY: no rule, no write, no
 * new RPC — the ticket's "if a datum needs a new query, add a read-only
 * server query". Missing env yields `not-configured`, a missing session
 * `unauthorized` — the page speaks the state, never a crash, never a fake row.
 */
export interface HubRowsState {
  status:
    | 'ok'
    | 'error'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  /** The learner's modules whose Mission row carries status 'complete'. */
  completedModuleKeys?: string[]
  /** The learner's OWN submission rounds (oldest first), latest fields only. */
  submissions?: Array<{
    mission_id: string
    submission_seq: number
    status: 'in_progress' | 'submitted' | 'needs_improvement' | 'approved'
    review_verdict: string | null
    review_notes_th: string | null
    review_notes_en: string | null
    created_at: string
  }>
  /** The modules whose Mission is the practical (upload) kind. */
  practicalModuleKeys?: string[]
}

export async function readHubRowsViaTables(): Promise<HubRowsState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  // OWN mission completions: the `ppg_module_missions_select` policy filters a
  // learner to learner_id = auth.uid() — no explicit filter is possible here
  // (the RLS IS the filter), and the seed's placeholder rows carry
  // 'incomplete', so only a real completion counts.
  const missions = await sup
    .from('ppg_module_missions')
    .select('module_key')
    .eq('status', 'complete')

  // OWN submission rounds: the `ppg_submissions_select` policy is the filter.
  // Oldest first — the caller reads the LAST row as the latest round.
  const submissions = await sup
    .from('ppg_submissions')
    .select('mission_id, submission_seq, status, review_verdict, review_notes_th, review_notes_en, created_at')
    .order('created_at', { ascending: true })

  // The practical-mission set: the shipped SELECT grants every signed-in role
  // the module_key list (the content catalog, not learner-private data).
  const practical = await sup
    .from('ppg_practical_missions')
    .select('module_key')

  for (const q of [missions, submissions, practical]) {
    if (q.error) return { status: 'error', detail: q.error.message }
  }

  return {
    status: 'ok',
    completedModuleKeys: (missions.data ?? []).map((r: { module_key: string }) => r.module_key),
    submissions: (submissions.data ?? []) as HubRowsState['submissions'],
    practicalModuleKeys: (practical.data ?? []).map((r: { module_key: string }) => r.module_key),
  }
}
