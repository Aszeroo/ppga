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
export const prettestFormSchema = z
  .object({
    // PPGA #18 (the live-browser finding): the RPC's `p_answers`/`p_autosave`
    // params are `jsonb` and the scorers read `jsonb_each_text`/`->>` on
    // them — the payload must stay a JSON OBJECT end to end. A
    // `JSON.stringify` transform made supabase-js serialize the payload as a
    // JSON string, PostgREST bound it as a jsonb SCALAR string, and every
    // submit died at `cannot call jsonb_each_text on a non-object` (the
    // RPC-direct seam tests cast the literal `'{"item_1":"A"}'::jsonb` and
    // never saw it).
    answers: z.record(z.string(), z.string()).optional(),
    autosave: z.record(z.string(), z.unknown()).default({}),
    // PPGA #18 (the #15-starter pattern): the hidden language field records
    // the taken language with the row (ADR-0002) — the DATABASE re-validates
    // th|en inside `ppg_prettest_start`.
    language: z.enum(['th', 'en']),
  })
  .strict()

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
    .eq('id', session.session.user.id)
    .limit(1)

  // The submission state rides the response's own row (the single-attempt
  // PK: a learner never has more than one response row; the filter narrows
  // to their own `learner_id = auth.uid()`).
  const { data: resRows, error: resError } = await sup
    .from('ppg_pretest_responses')
    .select('submitted_at, instrument_version, language, score')
    .eq('learner_id', session.session.user.id)
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
/**
 * PPGA #18 (the #15-starter pattern): the gated row start rides first —
 * idempotent. #8 shipped the submit requiring an EXISTING response row while
 * nothing ever created one (the upsert is UPDATE-only), so every UI submit
 * died at `response_missing`. `ppg_prettest_start` is the DB's own gate
 * (learner-only, consent first, the CURRENT instrument version recorded
 * server-side); a call whose gate fails reaches its exception verbatim.
 */
/** The RPC's gate-code error mapped to its failure detail verbatim (PPGA #18,
 * one mapper — the RPC's own gate name is the detail's prefix and the service
 * message its body; anything unmapped rides verbatim, never swallowed). */
function rpcFailureDetail(error: { message: string }, codes: readonly string[]): { ok: false; detail: string } {
  const lower = error.message.toLowerCase()
  for (const code of codes)
    if (lower.includes(code)) return { ok: false, detail: `${code}: ${error.message}` }
  return { ok: false, detail: error.message }
}

async function startPrettestRow(
  sup: NonNullable<Awaited<ReturnType<typeof createSupaSessionClient>>>,
  language: 'th' | 'en',
): Promise<{ ok: true } | { ok: false; detail: string }> {
  const { error } = await sup.rpc('ppg_prettest_start', { p_language: language } as never)
  if (error) return rpcFailureDetail(error, ['consent_not_yet', 'permission_denied'])
  return { ok: true }
}

/** The session-open + idempotent row start the autosave and the submit share
 * (PPGA #18): `not-configured`, `no session`, or a row-start gate failure
 * come back as the failure object verbatim — the caller returns it as-is. */
// fallow-ignore-next-line complexity
async function openStartedPrettest(language: 'th' | 'en'): Promise<
  { ok: true; sup: NonNullable<Awaited<ReturnType<typeof createSupaSessionClient>>> } | { ok: false; detail: string }
> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session?.session) return { ok: false, detail: 'no session' }

  const started = await startPrettestRow(sup, language)
  if (!started.ok) return started
  return { ok: true, sup }
}

export async function upsupertAutosaveViaRpc(
  autosave: Record<string, unknown>,
  language: 'th' | 'en',
): Promise<UpsertResult> {
  const opened = await openStartedPrettest(language)
  if (!opened.ok) return opened

  const { error } = await opened.sup.rpc(
    'ppg_prettest_upsert',
    { p_autosave: autosave } as never,
  )

  if (error) return rpcFailureDetail(error, ['already_submitted', 'permission_denied'])
  return { ok: true, detail: 'autosave stored pre-submission (your own row only)' }
}

/**
 * The submit: the score is computed SERVER-side from the answer key (never
 * client-decided), `submitted_at` stamps atomically. A second call cannot
 * find the function's UPDATE of an un-submitted row — the response reaches
 * `already_submitted_or_missing`, never a silently-overwritten row. The gated
 * row start rides first (idempotent — PPGA #18; a learner whose row never
 * existed no longer dies at `response_missing`).
 */
export async function submitViaRpc(
  answers: Record<string, string> | undefined,
  language: 'th' | 'en',
): Promise<SubmitResult> {
  const opened = await openStartedPrettest(language)
  if (!opened.ok) return opened

  const { data, error } = await opened.sup.rpc(
    'ppg_prettest_submit',
    { p_answers: answers ?? {} } as never,
  )

  if (error)
    return rpcFailureDetail(error, ['consent_not_yet', 'already_submitted', 'permission_denied', 'response_missing'])
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
