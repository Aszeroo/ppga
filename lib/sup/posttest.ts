import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Ticket #15 Post-Test server module: the close-chain screen's state (is the
 * Post-Test unlocked by the Final Project's ACCEPTANCE? is it submitted?),
 * the autosave the debounced save calls speak and the single submit all run
 * here on the request's user JWT. The browser never reaches the service-role
 * key; the DATABASE's RLS + the function's own gates decide — a learner whose
 * Final Project was never accepted reaches `final_project_not_accepted`,
 * never a silently-early Post-Test (ADR-0002); a resubmission/tamper reaches
 * the immutable trigger as `already_submitted`, never a silently-overwritten
 * row. The instrument grants NO XP, NO badge — a research instrument never
 * rewards (ADR-0001). Missing environment yields `not-configured` so the app
 * shows the state, never crashes.
 */
export const posttestFormSchema = z
  .object({
    answers: z
      .record(z.string(), z.string())
      .optional()
      .transform((v) => JSON.stringify(v ?? {})),
    autosave: z
      .record(z.string(), z.unknown())
      .default({})
      .transform((v) => JSON.stringify(v)),
    language: z.enum(['th', 'en']),
  })
  .strict()

export interface PosttestState {
  status:
    | 'ok'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  unlocked?: boolean
  submitted?: boolean
  instrumentVersion?: string
  language?: string
  score?: number
}

export interface PosttestUpsertResult {
  ok: boolean
  detail?: string
}

export interface PosttestSubmitResult {
  ok: boolean
  score?: number
  detail?: string
}

/**
 * The session client factory for a learner-gated call (the #8 engine's
 * pattern): the user's JWT (from the request's cookie jar) is the only
 * authority; we do NOT use the service-role key (it bypasses RLS). Missing
 * env yields `null` so the caller shows "not-configured" instead of crashing.
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
 * The close-chain state: the unlock rides the DATABASE's own authority —
 * the `ppg_posttest_unlocked` RPC (module-11 `complete` = the Teacher's
 * approval, the ONLY writer), never a browser-smuggled flag; the submission
 * state rides the learner's OWN response row (the single-attempt PK: absent
 * = never a submit).
 */
export async function readPosttestState(): Promise<PosttestState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data: unlockedData, error: unlockedError } = await sup.rpc(
    'ppg_posttest_unlocked',
    { p_learner: session.session.user.id } as never,
  )

  const { data: resRows, error: resError } = await sup
    .from('ppg_posttest_responses')
    .select('submitted_at, instrument_version, language, score')
    .eq('learner_id', session.session.user.id)
    .limit(1)

  if (unlockedError || resError)
    return { status: 'error', detail: unlockedError?.message || resError?.message || 'state read failed' }

  const resRow = resRows && resRows.length === 1 ? resRows[0] : null
  return {
    status: 'ok',
    unlocked: typeof unlockedData === 'boolean' ? unlockedData : false,
    submitted: resRow ? resRow.submitted_at != null : false,
    instrumentVersion: resRow?.instrument_version,
    language: resRow?.language,
    score: resRow?.score != null ? (Number(resRow.score) as number) : undefined,
  }
}

const toPayload = (v: Record<string, unknown> | string): string =>
  typeof v === 'string' ? v : JSON.stringify(v ?? {})

/** The gate error vocabulary the #15 RPCs raise (`final_project_not_accepted`
 * = early access, server-side; the rest mirror the #8 engine's words). */
function mapPosttestError(message: string): string | null {
  const m = message.toLowerCase()
  if (m.includes('final_project_not_accepted')) return `final_project_not_accepted: ${message}`
  if (m.includes('already_submitted')) return `already_submitted: ${message}`
  if (m.includes('permission_denied')) return `permission_denied: ${message}`
  if (m.includes('response_missing')) return `response_missing: ${message}`
  if (m.includes('language_denied')) return `language_denied: ${message}`
  return null
}

/**
 * The row starter: creates the learner's single response row (idempotent —
 * the #15 RPC's ON CONFLICT), recording the CURRENT instrument version
 * (server's own read) + the taken language, AFTER the Final Project's
 * acceptance only (the unlock gate speaks inside the RPC). The autosave and
 * submit routes call it before their real call so the row always exists for
 * a legitimately-unlocked learner (the gap the #8 engine left open).
 */
async function startPosttestRow(
  sup: NonNullable<Awaited<ReturnType<typeof createSupaSessionClient>>>,
  language: 'th' | 'en',
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const { error } = await sup.rpc('ppg_posttest_start', { p_language: language } as never)
  if (error) {
    return { ok: false, detail: mapPosttestError(error.message) ?? error.message }
  }
  return { ok: true }
}

/**
 * The autosave: the debounced save posts the `ppg_posttest_upsert` RPC — the
 * CALLER's own row pre-submission only (RLS + `submitted_at IS NULL`); a
 * post-submit call reaches the immutable trigger, never a silent overwrite.
 * The gated row start rides first (idempotent).
 */
export async function upsertPosttestAutosaveViaRpc(
  autosave: Record<string, unknown> | string,
  language: 'th' | 'en',
): Promise<PosttestUpsertResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  const started = await startPosttestRow(sup, language)
  if (!started.ok) return started

  const { error } = await sup.rpc(
    'ppg_posttest_upsert',
    { p_autosave: toPayload(autosave) } as never,
  )

  if (error) {
    return { ok: false, detail: mapPosttestError(error.message) ?? error.message }
  }
  return { ok: true, detail: 'autosave stored pre-submission (your own row only)' }
}

/**
 * The submit: the score is computed SERVER-side from the answer key (never
 * client-decided), `submitted_at` stamps atomically. The unlock gate speaks
 * inside the function — an early call (no Final Project acceptance) reaches
 * `final_project_not_accepted`; a second submit reaches
 * `already_submitted_or_missing`. NO XP, NO badge ever rides (ADR-0001).
 * The gated row start rides first (idempotent).
 */
export async function submitPosttestViaRpc(
  answers: Record<string, string> | string,
  language: 'th' | 'en',
): Promise<PosttestSubmitResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  const started = await startPosttestRow(sup, language)
  if (!started.ok) return { ok: false, detail: started.detail }

  const { data, error } = await sup.rpc(
    'ppg_posttest_submit',
    { p_answers: toPayload(answers) } as never,
  )

  if (error) {
    return { ok: false, detail: mapPosttestError(error.message) ?? error.message }
  }
  return {
    ok: true,
    score: typeof data === 'number' ? (data as number) : undefined,
    detail: 'submitted once; score server-side; version + language recorded',
  }
}

/**
 * The instrument's items the Post-Test screen must show (a FINAL-PROJECT-
 * ACCEPTED learner's read under the instrument's policy; an early learner
 * reaches `denied`, never a smuggled read; the answer key never leaves the
 * DATABASE).
 */
export async function readPosttestItemsViaTable(): Promise<{
  status: 'ok' | 'empty' | 'error' | 'denied' | 'not-configured' | 'unauthorized'
  detail?: string
  items?: Array<{ id: string; th: { prompt: string; choices: Record<string, string> }; en: { prompt: string; choices: Record<string, string> } }>
}> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup
    .from('ppg_posttest_instruments')
    .select('items')
    .limit(1)

  if (error) {
    if (error.message.toLowerCase().includes('violates row-level security'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }
  if (!data || data.length === 0)
    return { status: 'empty', detail: 'no instrument (read granted, table empty)' }
  return {
    status: 'ok',
    items: data[0].items as never,
  }
}
