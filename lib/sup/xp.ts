import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Ticket #10 XP/self-check server module: the Self-Check questions a SEE-ABLE
 * Lesson shows (the read's RPC NEVER carries the answer key), the check the
 * submit RPC runs (the DATABASE's own answer-key sum — server-side pass/fail
 * only, the +50 XP idempotently the first pass only), and the XP/Level
 * summary the header reads (the real Level/XP/progress DERIVED from the
 * learner's own ledger — no fake numbers) all run here. The browser never
 * reaches the service-role key; every call carries the request's user JWT so
 * the DATABASE's RLS + the function's own gates decide — a learner who has
 * not passed the #8 gate reaches the check as `gate_closed`, never a started
 * Self-Check; a locked/draft/arched Lesson reaches `lesson_not_visible`,
 * never a hidden check; an answer-key smuggle NEVER lands (the read RPC
 * never carries `is_correct`). Missing environment yields `not-configured`
 * so the app shows the state, never crashes.
 */
export const contentKeySchema = z.string().regex(/^(module-\d{2})|(module-\d{2}-lesson-\d{2})$/i)

export const answersSchema = z
  .object({
    answers: z
      .record(z.string(), z.string())
      .transform((v) => JSON.stringify(v)),
  })
  .strict()

export interface SelfCheckQuestionsState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  questions?: Array<{
    lesson_key: string
    order_index: number
    option_key: string
    prompt_th: string
    prompt_en: string
    option_th: string
    option_en: string
  }>
}

export interface SelfCheckResult {
  ok: boolean
  detail?: string
  outcome?: 'pass' | 'fail'
  attemptSeq?: number
  xpGranted?: number
  badgeGranted?: boolean
}

export interface XpSummaryState {
  status:
    | 'ok'
    | 'error'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  totalXp?: number
  level?: number
  xpToNext?: number
  progressPct?: number
  badges?: Array<{
    badge_key: string
    label_th: string
    label_en: string
    event_ref: string
    award_event: string
  }>
}

/**
 * The session client factory for an XP/self-check call. The user's JWT (from
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
 * The Self-Check questions a SEE-ABLE Lesson shows: the RPC's jsonb NEVER
 * carries `is_correct` — the answer key never reaches the browser (the
 * check function's definer read is the only summing authority). A locked/
 * draft/arched Lesson returns `[]` server-side (no question rows, never a
 * hidden UI); an ungated learner returns `[]` (the function's own filter).
 */
export async function readSelfCheckQuestionsViaRpc(lessonKey: string): Promise<SelfCheckQuestionsState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!contentKeySchema.safeParse(lessonKey).success)
    return { status: 'denied', detail: 'lesson key not in the seeded shape (module-NN-lesson-NN)' }

  const { data, error } = await sup.rpc(
    'ppg_self_check_questions',
    { p_lesson_key: lessonKey } as never,
  )

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: error.message }
    if (error.message.toLowerCase().includes('violates row-level security'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  if (!data || !Array.isArray(data) || data.length === 0)
    return { status: 'empty', detail: 'no see-able questions (the gate/lock rule denies this caller)' }
  return { status: 'ok', questions: data as SelfCheckQuestionsState['questions'] }
}

/**
 * The Self-Check check: the DATABASE's own answer-key sum runs here (POST
 * /api/self-check/submit calls it; the browser never decides the outcome,
 * never sees the key). Server-side pass/fail ONLY (a wrong answer fails,
 * all-correct passes; unlimited retries add event rows). On the FIRST pass
 * of the lesson the +50 XP lands (idempotent: the ledger PK — a retry/
 * double-click/replay conflicts, never a second +50; the returned
 * `xp_granted` says what actually landed); the First Steps badge on the
 * learner's first pass of ANY lesson (the award PK — a duplicate conflicts).
 * A non-learner smuggle reaches `permission_denied`; an ungated reaches
 * `gate_closed`; a locked/draft/arched lesson reaches `lesson_not_visible`.
 */
export async function checkSelfCheckViaRpc(lessonKey: string, answers: Record<string, string>): Promise<SelfCheckResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  if (!contentKeySchema.safeParse(lessonKey).success)
    return { ok: false, detail: 'target lesson key not in the seeded shape (module-NN-lesson-NN)' }

  const parsed = answersSchema.safeParse({ answers })
  if (!parsed.success)
    return {
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    }

  const { data, error } = await sup.rpc(
    'ppg_check_self_check',
    {
      p_lesson_key: lessonKey,
      p_answers: parsed.data.answers as never,
    } as never,
  )

  if (error) {
    const m = error.message.toLowerCase()
    if (m.includes('permission_denied')) return { ok: false, detail: `permission_denied: ${error.message}` }
    if (m.includes('gate_closed')) return { ok: false, detail: `gate_closed: ${error.message}` }
    if (m.includes('lesson_not_visible')) return { ok: false, detail: `lesson_not_visible: ${error.message}` }
    return { ok: false, detail: error.message }
  }

  const row = data as {
    outcome?: 'pass' | 'fail'
    attempt_seq?: number
    xp_granted?: number
    badge_granted?: boolean
  }
  return {
    ok: true,
    outcome: row.outcome,
    attemptSeq: row.attempt_seq,
    xpGranted: row.xp_granted,
    badgeGranted: row.badge_granted,
  }
}

/**
 * The XP/Level summary the header reads: the real Level/XP/progress
 * DERIVED from the learner's own XP ledger (total = the SUM; level =
 * floor(total/100)+1; xp-to-next = level*100 - total; progress =
 * remainder/100) + the earned badges (the awards' own records). No fake
 * numbers (the state is the ledger's read, never a client count); filtered
 * to the CALLER's own rows (an other learner's XP/Level never appears).
 */
export async function readXpSummaryViaRpc(): Promise<XpSummaryState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup.rpc('ppg_xp_summary', {} as never)

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied' as never, detail: error.message }
    return { status: 'error', detail: error.message }
  }

  const row = data as {
    total_xp?: number
    level?: number
    xp_to_next?: number
    progress_pct?: number
    badges?: Array<{
      badge_key: string
      label_th: string
      label_en: string
      event_ref: string
      award_event: string
    }>
  }
  return {
    status: 'ok',
    totalXp: row.total_xp,
    level: row.level,
    xpToNext: row.xp_to_next,
    progressPct: row.progress_pct,
    badges: row.badges,
  }
}