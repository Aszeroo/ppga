import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Ticket #8 Pre-Test server module: the gate status a dashboard's state
 * machine reads, the autosave upsert the debounced save calls speak, and the
 * submit the single submit button calls all run here. The browser never
 * reaches the service-role key; every call carries the request's user JWT so
 * the DATABASE's RLS + the function's own gates decide — a learner who
 * lacks consent reaches the upsupert/submit as `consent_not_yet`, never a
 * silently-started Pre-Test; a resubmission/tamper reaches the trigger as
 * `already_submitted`, never a silently-overwritten row. Missing environment
 * yields `not-configured` so the app shows the state, never crashes.
 */
export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{32}$/i)

export const prettestFormSchema = z
  .object({
    answers: z
      .record(z.string(), z.string())
      .transform((v) => JSON.stringify(v)),
    autosave: z
      .record(z.string(), z.unknown())
      .default({})
      .transform((v) => JSON.stringify(v)),
  })
  .strict()

export const languageSchema = z.enum(['th', 'en'])

export interface GateState {
  status:
    | 'ok'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  consent?: boolean
  override?: boolean
  submitted?: boolean
  instrumentVersion?: string
  language?: string
  score?: number
}

export interface UpsertResult {
  ok: boolean
  detail?: string
}

export interface SubmitResult {
  ok: boolean
  score?: number
  detail?: string
}

/**
 * The session client factory for a learner-gated call. The user's JWT (from
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
 * The learner's gate status: the two flags + the submission state live in the
 * DATABASE (the profiles columns + the response's `submitted_at`) and the
 * read rides the CALLER's own JWT + RLS (the learner's own-row select
 * policies grant exactly their own row — a smuggled gate value from the
 * browser can never pass this read). The gate's copy of the submission is
 * what the content gate (#9's future tables) speaks at the row level; the
 * UI's state machine rides the same authority.
 */
export async function readGateViaTable(): Promise<GateState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  // The caller's own row only: a teacher/admin sees EVERY profile row under
  // their SELECT policy (#3's admin/teacher read-all), so an unfiltered
  // `limit(1)` here would pick some OTHER learner's gate flags. The filter
  // narrows to `id = auth.uid()` — the learner's own-row RLS read already
  // restricts them to their own row; the admin/teacher's read of every row
  // now resolves to their own one row.
  const { data: gateRows, error: gateError } = await sup
    .from('ppg_profiles')
    .select('consent, prettest_unlocked_override')
    .filter('id', 'id', session.session.user.id)
    .limit(1)

  // The submission state rides the response's own row (the single-attempt
  // PK: a learner never has more than one response row; the filter narrows
  // to their own `learner_id = auth.uid()`).
  const { data: resRows, error: resError } = await sup
    .from('ppg_pretest_responses')
    .select('submitted_at, instrument_version, language, score')
    .filter('learner_id', 'learner_id', session.session.user.id)
    .limit(1)

  if (gateError || resError)
    return { status: 'error', detail: gateError?.message || resError?.message || 'gate read failed' }

  const gateRow = gateRows && gateRows.length === 1 ? gateRows[0] : null
  const resRow = resRows && resRows.length === 1 ? resRows[0] : null

  if (
    gateRow &&
    (typeof gateRow.consent !== 'boolean' ||
      typeof gateRow.prettest_unlocked_override !== 'boolean')
  )
    return {
      status: 'denied',
      detail: 'gate read returned a non-boolean flag (the DATABASE is the authority)',
    }

  // A failed profiles read (RLS deny / not-configured / a PostgREST error) is
  // a `false` by default — the dashboard still stands (no blank screen), the
  // next read speaks again. The response row absent = un-submitted by
  // construction (the single-attempt PK: no row to read means never a submit).
  const consent = gateRow && typeof gateRow.consent === 'boolean' ? (gateRow.consent as boolean) : false
  const override =
    gateRow && typeof gateRow.prettest_unlocked_override === 'boolean'
      ? (gateRow.prettest_unlocked_override as boolean)
      : false
  const submitted = resRow && resRow.submitted_at != null
  return {
    status: 'ok',
    consent,
    override,
    submitted: resRow ? resRow.submitted_at != null : undefined,
    instrumentVersion: resRow?.instrument_version,
    language: resRow?.language,
    score: resRow?.score != null ? (Number(resRow.score) as number) : undefined,
  }
}

/**
 * The autosave / pre-submission upsupert: the debounced save calls speak this
 * BEFORE a submit only (the function's UPDATE of the CALLER's own row under
 * their own JWT + RLS: `learner_id = auth.uid()` + `submitted_at IS NULL`).
 * A post-submit upsupert reaches PostgREST as `already_submitted`, never a
 * silent overwrite.
 */
const toPayload = (v: Record<string, unknown> | string): string =>
  typeof v === 'string' ? v : JSON.stringify(v ?? {})

export async function upsupertAutosaveViaRpc(
  autosave: Record<string, unknown> | string,
): Promise<UpsertResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  const { error } = await sup.rpc(
    'ppg_prettest_upsert',
    { p_autosave: toPayload(autosave) } as never,
  )

  if (error) {
    if (error.message.toLowerCase().includes('already_submitted'))
      return { ok: false, detail: `already_submitted: ${error.message}` }
    if (error.message.toLowerCase().includes('permission_denied'))
      return { ok: false, detail: `permission_denied: ${error.message}` }
    return { ok: false, detail: error.message }
  }
  return { ok: true, detail: 'autosave stored pre-submission (your own row only)' }
}

/**
 * The submit: the score is computed SERVER-side from the answer key (never
 * client-decided), `submitted_at` stamps atomically. A second call cannot
 * find the function's UPDATE of an un-submitted row — the response reaches
 * `already_submitted_or_missing`, never a silently-overwritten row.
 */
export async function submitViaRpc(answers: Record<string, string> | string): Promise<SubmitResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  const { data, error } = await sup.rpc(
    'ppg_prettest_submit',
    { p_answers: toPayload(answers) } as never,
  )

  if (error) {
    if (error.message.toLowerCase().includes('consent_not_yet'))
      return { ok: false, detail: `consent_not_yet: ${error.message}` }
    if (error.message.toLowerCase().includes('already_submitted'))
      return { ok: false, detail: `already_submitted: ${error.message}` }
    if (error.message.toLowerCase().includes('permission_denied'))
      return { ok: false, detail: `permission_denied: ${error.message}` }
    if (error.message.toLowerCase().includes('response_missing'))
      return { ok: false, detail: `response_missing: ${error.message}` }
    return { ok: false, detail: error.message }
  }
  return {
    ok: true,
    score: typeof data === 'number' ? (data as number) : undefined,
    detail: 'submitted once; score server-side; version + language recorded',
  }
}

/** The instrument's items the Pre-Test screen must show (a consenting
 * learner's own read under the instrument's items-column policy; an
 * unconsented learner reaches `RLS denied`, never a smuggled read; the
 * answer key is never read here). */
export async function readItemsViaTable(): Promise<{
  status: 'ok' | 'empty' | 'error' | 'denied' | 'not-configured' | 'unauthorized'
  detail?: string
  items?: Array<{ id: string; th: { prompt: string; choices: Record<string, string> }; en: { prompt: string; choices: Record<string, string> } }>
}> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup
    .from('ppg_pretest_instruments')
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
