import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Ticket #15 Satisfaction-Survey server module: the close screen's state (is
 * the Survey unlocked by the learner's OWN submitted Post-Test? is the Survey
 * submitted?), the autosave the debounced save calls speak and the single
 * submit all run here on the request's user JWT. The DATABASE decides: a
 * learner whose Post-Test was never submitted reaches
 * `posttest_not_submitted`, never a silently-early Survey (ADR-0002); a
 * resubmission/tamper reaches the immutable trigger as `already_submitted`.
 * The Survey has NO score — satisfaction is not an assessment — and grants
 * NO XP, NO badge: a research instrument never rewards (ADR-0001). Missing
 * environment yields `not-configured` so the app shows the state, never
 * crashes.
 */
export const surveyFormSchema = z
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

export interface SurveyState {
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
}

export interface SurveyUpsertResult {
  ok: boolean
  detail?: string
}

export interface SurveySubmitResult {
  ok: boolean
  detail?: string
}

/** The session client factory (the #8 engine's pattern): the user's JWT is
 * the only authority; never the service-role key. */
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
 * The Survey state: the unlock rides the DATABASE's `ppg_survey_unlocked`
 * RPC (the learner's OWN Post-Test submitted stamp — never a browser-smuggled
 * flag); the submission state rides the learner's OWN response row.
 */
export async function readSurveyState(): Promise<SurveyState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data: unlockedData, error: unlockedError } = await sup.rpc(
    'ppg_survey_unlocked',
    { p_learner: session.session.user.id } as never,
  )

  const { data: resRows, error: resError } = await sup
    .from('ppg_survey_responses')
    .select('submitted_at, instrument_version, language')
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
  }
}

const toPayload = (v: Record<string, unknown> | string): string =>
  typeof v === 'string' ? v : JSON.stringify(v ?? {})

/** The gate error vocabulary the #15 Survey RPCs raise
 * (`posttest_not_submitted` = early access, server-side). */
function mapSurveyError(message: string): string | null {
  const m = message.toLowerCase()
  if (m.includes('posttest_not_submitted')) return `posttest_not_submitted: ${message}`
  if (m.includes('already_submitted')) return `already_submitted: ${message}`
  if (m.includes('permission_denied')) return `permission_denied: ${message}`
  if (m.includes('language_denied')) return `language_denied: ${message}`
  return null
}

/**
 * The row starter: creates the learner's single Survey response row
 * (idempotent — the RPC's ON CONFLICT), recording the CURRENT instrument
 * version (server's own read) + the taken language, AFTER the learner's own
 * Post-Test is submitted only (the unlock gate speaks inside the RPC). The
 * autosave and submit routes call it before their real call.
 */
async function startSurveyRow(
  sup: NonNullable<Awaited<ReturnType<typeof createSupaSessionClient>>>,
  language: 'th' | 'en',
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const { error } = await sup.rpc('ppg_survey_start', { p_language: language } as never)
  if (error) {
    return { ok: false, detail: mapSurveyError(error.message) ?? error.message }
  }
  return { ok: true }
}

/** The autosave: the CALLER's own row pre-submission only (RLS +
 * `submitted_at IS NULL`); a post-submit call reaches the immutable trigger.
 * The gated row start rides first (idempotent). */
export async function upsertSurveyAutosaveViaRpc(
  autosave: Record<string, unknown> | string,
  language: 'th' | 'en',
): Promise<SurveyUpsertResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  const started = await startSurveyRow(sup, language)
  if (!started.ok) return started

  const { error } = await sup.rpc(
    'ppg_survey_upsert',
    { p_autosave: toPayload(autosave) } as never,
  )

  if (error) {
    return { ok: false, detail: mapSurveyError(error.message) ?? error.message }
  }
  return { ok: true, detail: 'autosave stored pre-submission (your own row only)' }
}

/**
 * The submit: `submitted_at` stamps atomically, the answers + the recorded
 * version + language ride the row. The unlock gate speaks inside the function
 * — a call before the Post-Test reaches `posttest_not_submitted`; a second
 * submit reaches `already_submitted_or_missing`. NO score, NO XP, NO badge
 * (ADR-0001 + satisfaction is not an assessment).
 */
export async function submitSurveyViaRpc(
  answers: Record<string, string> | string,
  language: 'th' | 'en',
): Promise<SurveySubmitResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  const started = await startSurveyRow(sup, language)
  if (!started.ok) return { ok: false, detail: started.detail }

  const { error } = await sup.rpc(
    'ppg_survey_submit',
    { p_answers: toPayload(answers) } as never,
  )

  if (error) {
    return { ok: false, detail: mapSurveyError(error.message) ?? error.message }
  }
  return {
    ok: true,
    detail: 'submitted once; version + language recorded; the Course close is complete',
  }
}

/**
 * The survey items the screen must show (a Post-Test-submitted learner's read
 * under the instrument's policy; an early learner reaches `denied`, never a
 * smuggled read; the survey carries no key).
 */
export async function readSurveyItemsViaTable(): Promise<{
  status: 'ok' | 'empty' | 'error' | 'denied' | 'not-configured' | 'unauthorized'
  detail?: string
  items?: Array<{ id: string; th: { prompt: string; choices: Record<string, string> }; en: { prompt: string; choices: Record<string, string> } }>
}> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup
    .from('ppg_survey_instruments')
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
