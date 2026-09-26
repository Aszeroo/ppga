import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Ticket #11 Knowledge Mission server module: the Mission read (the
 * instructions + questions+options WITHOUT the answer key, gated server-side
 * to the CALLER's own visibility — a locked/un-gated/un-self-checked
 * Mission returns `empty`, never a hidden UI), the submit RPC (the
 * DATABASE's own answer-key sum at the 70% pass threshold — server-side
 * pass/fail ONLY; unlimited retries below the threshold; the per-question
 * bilingual feedback: what was right, what was wrong, WHY, what to review),
 * the attempt history read (the score history retained append-only, the
 * CALLER's own rows only), and the badge gallery read (every badge with its
 * bilingual criteria + the CALLER's earned/locked state) all run here. The
 * browser never reaches the service-role key; every call carries the
 * request's user JWT so the DATABASE's RLS + the function's own gates
 * decide — a learner who has not passed the #8 gate reaches the submit as
 * `gate_closed`, never a scored attempt; a locked module reaches
 * `mission_not_visible`, never a hidden form; an answer-key smuggle NEVER
 * lands (the read RPC never carries `is_correct`). Missing environment
 * yields `not-configured` so the app shows the state, never crashes.
 */
export const moduleKeySchema = z.string().regex(/^module-\d{2}$/i)

export const answersSchema = z
  .object({
    answers: z
      .record(z.string(), z.string())
      .transform((v) => JSON.stringify(v)),
  })
  .strict()

export interface MissionReadState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  instructions?: { module_key: string; instructions_th: string; instructions_en: string; pass_threshold_pct: number }
  questions?: Array<{
    module_key: string
    order_index: number
    option_key: string
    prompt_th: string
    prompt_en: string
    option_th: string
    option_en: string
  }>
}

export interface MissionAttempt {
  module_key: string
  attempt_seq: number
  outcome: 'pass' | 'fail'
  score_pct: number
}

export interface MissionHistoryState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  attempts?: MissionAttempt[]
}

export interface MissionFeedbackItem {
  module_key: string
  order_index: number
  chosen_key: string
  is_right: boolean
  why_th: string
  why_en: string
  review_th: string
  review_en: string
}

export interface MissionResult {
  ok: boolean
  detail?: string
  outcome?: 'pass' | 'fail'
  scorePct?: number
  passThresholdPct?: number
  attemptSeq?: number
  xpGranted?: number
  badgeGranted?: boolean
  moduleBadgeKey?: string
  feedback?: MissionFeedbackItem[]
}

export interface BadgeGalleryItem {
  badge_key: string
  label_th: string
  label_en: string
  criteria_th: string
  criteria_en: string
  award_event: string
  earned: boolean
  event_ref?: string
}

export interface BadgeGalleryState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  badges?: BadgeGalleryItem[]
}

/**
 * The session client factory for a Mission/badge call. The user's JWT (from
 * the request's cookie jar) is the only authority; we do NOT use the
 * service-role key (it bypasses RLS). Missing env yields `null` so the
 * caller shows "not-configured" instead of crashing. The jar is resolved
 * before the (sync) storage callback is built (`next/headers` is async).
 */
async function createSupaSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY
  if (!url || !anonKey) return null

  const jar = await cookies()
  return createClient(url, anonKey, {
    auth: {
      storageKey: 'ppga_session',
      storage: {
        isServer: true as const,
        getItem: (key: string) => jar.get(key)?.value ?? null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    },
  })
}

/**
 * The Mission read: the instructions + questions+options the SEE-ABLE
 * Mission shows (the `ppg_read_mission` RPC — the answer key NEVER lands
 * in the jsonb; the submit function's definer read is the ONLY summing
 * authority). A locked/un-gated/un-self-checked Mission returns `{}`
 * server-side — the page shows the not-visible state text, never a
 * hidden form. The `pass_threshold_pct` 70 is the SERVER's own threshold.
 */
export async function readMissionViaRpc(moduleKey: string): Promise<MissionReadState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { status: 'denied', detail: 'module key not in the seeded shape (module-NN)' }

  const { data, error } = await sup.rpc('ppg_read_mission', { p_module_key: moduleKey } as never)

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: error.message }
    if (error.message.toLowerCase().includes('violates row-level security'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  const obj = data as unknown
  if (obj && typeof obj === 'object' && Object.keys(obj).length) {
    const row = obj as {
      module_key?: string
      instructions_th?: string
      instructions_en?: string
      pass_threshold_pct?: number
      questions?: MissionReadState['questions']
    }
    if (row.module_key && row.instructions_th && row.instructions_en)
      return {
        status: 'ok',
        instructions: {
          module_key: row.module_key,
          instructions_th: row.instructions_th,
          instructions_en: row.instructions_en,
          pass_threshold_pct: row.pass_threshold_pct ?? 70,
        },
        questions: row.questions,
      }
    return { status: 'empty', detail: 'no see-able Mission (the gate/lock rule denies this caller)' }
  }
  return { status: 'empty', detail: 'no see-able Mission (the gate/lock rule denies this caller)' }
}

/**
 * The Mission attempt history: the score history RETAINED across attempts
 * (append-only; the `ppg_mission_history` RPC — the CALLER's own rows only,
 * an other learner's history never rides out; the order the attempt_seq).
 * Scores never ride the leaderboard (ADR-0001: XP ≠ any score; the header
 * reads XP, never a score).
 */
export async function readMissionHistoryViaRpc(moduleKey: string): Promise<MissionHistoryState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { status: 'denied', detail: 'module key not in the seeded shape (module-NN)' }

  const { data, error } = await sup.rpc('ppg_mission_history', { p_module_key: moduleKey } as never)

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  if (!data || !Array.isArray(data) || data.length === 0)
    return { status: 'empty', detail: 'no attempt rows (the learner never submits this Mission)' }
  return { status: 'ok', attempts: data as MissionHistoryState['attempts'] }
}

/**
 * The Mission submit: the DATABASE's own answer-key sum at the 70%
 * threshold (POST /api/mission/submit calls it; the browser never decides
 * the outcome, never sees the key). Server-side pass/fail ONLY (the
 * score% = the matched correct options / all, rounded; PASS iff >= 70).
 * Unlimited retries below the threshold ADD attempt rows (the PK stamps
 * the retry count; the score history retained). The per-question
 * educational feedback (what was right, what was wrong, WHY, what to
 * review — bilingual, actionable, NOT a 'correct/incorrect' label only).
 * On the FIRST pass the completion hook lands in ONE transaction: the
 * module row UPSERTs to `complete` (the #9/#10 linear rule's real
 * unlock — module N+1 opens server-side, the client cannot bypass), the
 * +100 XP idempotently (the ledger PK — a replay conflicts, never a
 * second +100; `xp_granted` says what landed), the Module badge on the
 * completion (the award PK — a duplicate conflicts). A non-learner
 * smuggle reaches `permission_denied`; an ungated reaches `gate_closed`;
 * a locked/un-passed Mission reaches `mission_not_visible`.
 */
export async function submitMissionViaRpc(moduleKey: string, answers: Record<string, string>): Promise<MissionResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { ok: false, detail: 'target module key not in the seeded shape (module-NN)' }

  const parsed = answersSchema.safeParse({ answers })
  if (!parsed.success)
    return {
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    }

  const { data, error } = await sup.rpc(
    'ppg_submit_mission',
    {
      p_module_key: moduleKey,
      p_answers: parsed.data.answers as never,
    } as never,
  )

  if (error) {
    const m = error.message.toLowerCase()
    if (m.includes('permission_denied')) return { ok: false, detail: `permission_denied: ${error.message}` }
    if (m.includes('gate_closed')) return { ok: false, detail: `gate_closed: ${error.message}` }
    if (m.includes('mission_not_visible')) return { ok: false, detail: `mission_not_visible: ${error.message}` }
    if (m.includes('mission_content_missing')) return { ok: false, detail: `mission_content_missing: ${error.message}` }
    return { ok: false, detail: error.message }
  }

  const row = data as {
    outcome?: 'pass' | 'fail'
    score_pct?: number
    pass_threshold_pct?: number
    attempt_seq?: number
    xp_granted?: number
    badge_granted?: boolean
    module_badge_key?: string
    feedback?: MissionFeedbackItem[]
  }
  return {
    ok: true,
    outcome: row.outcome,
    scorePct: row.score_pct,
    passThresholdPct: row.pass_threshold_pct,
    attemptSeq: row.attempt_seq,
    xpGranted: row.xp_granted,
    badgeGranted: row.badge_granted,
    moduleBadgeKey: row.module_badge_key,
    feedback: row.feedback,
  }
}

/**
 * The badge gallery read: every badge + the CALLER's earned/locked state
 * WITH its bilingual criteria text (the award_rule copy shown in BOTH
 * states). Earned = the award row for the CALLER; locked = no award YET
 * (the criteria stay visible anyway — the state announced by the text +
 * the StatusPill's aria-label, never colour-alone). The earned/locked is
 * the CALLER's own awards (the definer's rights filtered to `auth.uid()`)
 * — an other learner's earned-state never rides out.
 */
export async function readBadgeGalleryViaRpc(): Promise<BadgeGalleryState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup.rpc('ppg_badge_gallery', {} as never)

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied' as never, detail: error.message }
    return { status: 'error', detail: error.message }
  }

  if (!data || !Array.isArray(data) || data.length === 0)
    return { status: 'empty', detail: 'no badge rows (the taxonomy never seeded server-side)' }
  const gallery = (data as Array<BadgeGalleryItem>).map((r) => ({
    ...r,
    earned: typeof r.earned === 'boolean' ? r.earned : false,
  }))
  return { status: 'ok', badges: gallery }
}
