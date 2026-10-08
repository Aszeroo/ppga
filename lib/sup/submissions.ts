import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Ticket #13 Practical Mission submission server module: create submission (magic-byte
 * + size validated server-side, then a storage.put under the path scheme
 * submissions/{learnerId}/{missionId}/{submissionId} + one ppg_submissions insert), the
 * status lifecycle RPC (ppg_set_submission_status — in_progress->submitted;
 * submitted->{needs_improvement|approved}; needs_improvement->approved, never a client
 * -decided outcome), the submission history read (append-only — the CALLER's own rows,
 * never another learner's), and the signed-URL download (the owner+teacher/admin gate,
 * ~60s expiry, never a public bucket read). The browser never reaches the service-role
 * key; every call carries the request's user JWT so the DATABASE's RLS + the function's
 * own gates decide — a stranger's upload reaches permission_denied, never a smuggled row.
 * Missing env yields not-configured so the app shows the state, never crashes.
 */
const moduleKeySchema = z.string().regex(/^module-(08|09|10|11)$/i)

const submissionFileSchema = z
  .object({
    magic: z.enum(['pptx','ppt']),
    size: z.bigint().gte(BigInt(1)).lte(BigInt(25000000)),
  })
  .strict()

export type SubmissionStatus = 'in_progress' | 'submitted' | 'needs_improvement' | 'approved'

export interface SubmissionCreateResult {
  ok: boolean
  detail?: string
  submissionSeq?: number
  storagePath?: string
  status?: 'in_progress' | 'submitted' | 'needs_improvement' | 'approved'
}

export interface SubmissionRow {
  learner_id: string
  mission_id: string
  submission_seq: number
  storage_path: string
  file_magic: string
  file_size: number
  reflection: string
  status: 'in_progress' | 'submitted' | 'needs_improvement' | 'approved'
  review_verdict: string | null
  review_notes_th: string | null
  review_notes_en: string | null
  created_at: string
}

export interface SubmissionHistoryState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  submissions?: SubmissionRow[]
}

export interface SignedUrlResult {
  ok: boolean
  detail?: string
  url?: string
  expiresIn?: number
}

/**
 * The session client factory for a submission call. The user's JWT (from the
 * request's cookie jar) is the only authority; we do NOT use the service-role
 * key (it bypasses RLS). Missing env yields null so the caller shows
 * "not-configured" instead of crashing. The jar is resolved before the (sync)
 * storage callback is built (next/headers is async).
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
 * The magic-byte validator (a real file-signature check, NOT the extension):
 * pptx = PK\x03\x04 (the zip central-directory header), ppt = \xD0\xCF\x11\xE0
 * (the OLE container signature). Garbage of any other prefix yields null — the
 * upload form rejects a wrong type with a clear bilingual error, never a smuggled row.
 */
// fallow-ignore-next-line complexity
function magicByteValidator(buf: Uint8Array): 'pptx' | 'ppt' | null {
  // pptx: bytes 0-3 = 0x50 0x4b 0x03 0x04 ('PK' + a zip local-header marker)
  if (
    buf.length >= 4 &&
    buf[0] === 0x50 &&
    buf[1] === 0x4b &&
    buf[2] === 0x03 &&
    buf[3] === 0x04
  )
    return 'pptx'
  // ppt: bytes 0-3 = 0xD0 0xCF 0x11 0xE0 (the OLE container signature)
  if (
    buf.length >= 4 &&
    buf[0] === 0xd0 &&
    buf[1] === 0xcf &&
    buf[2] === 0x11 &&
    buf[3] === 0xe0
  )
    return 'ppt'
  return null
}

/**
 * The create submission: the upload form posts the file + a short reflection to
 * /api/submissions — the magic-byte + size gate run SERVER-side (never the
 * extension alone; the file signature check is the authority), then the file rides
 * storage.put to the private bucket under the path scheme
 * submissions/{learnerId}/{missionId}/{submissionId} + one ppg_submissions insert
 * (the row status starts in_progress). A wrong type / oversize yields the bilingual
 * error detail (the form shows it; a smuggled row NEVER lands: the RLS insert policy
 * denies a stranger's write, never a silent 0-row). The resubmit APPENDS a NEW row
 * under a HIGHER submission_seq (the old row stays as the history).
 */
// fallow-ignore-next-line complexity
export async function createSubmissionViaRpc(
  moduleKey: string,
  fileBuf: Uint8Array,
  fileName: string,
  reflection: string,
): Promise<SubmissionCreateResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { ok: false, detail: 'target module key not in the practical shape (module-08|09|10|11)' }

  const magic = magicByteValidator(fileBuf)
  if (!magic)
    return { ok: false, detail: `magic_byte_rejected: the file prefix NEVER is .pptx/.ppt (${fileName})` }

  const sizeCheck = submissionFileSchema.safeParse({ magic, size: BigInt(fileBuf.byteLength) })
  if (!sizeCheck.success)
    return {
      ok: false,
      detail: sizeCheck.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    }

  const { data: userRes } = await sup.auth.getUser()
  const uid = userRes?.user?.id ?? null
  if (!uid) return { ok: false, detail: 'no session' }
  const seqRes = await sup.rpc('ppg_submission_seq_next', { p_learner_id: uid, p_mission_id: moduleKey } as never)
  const seq = (seqRes.data as number) ?? 1
  const path = `submissions/${uid}/${moduleKey}/${seq}`

  // PPGA #18 (production verification, finding #6): storage-js's `upload`
  // prefixes `object/` ITSELF (the endpoint is /storage/v1/object/{bucket}/
  // {path}) — a hand-prefixed `object/${path}` stored the object under the
  // name `object/submissions/...`, the write policy's `split_part(name, '/',
  // 2) = auth.uid()` check read 'submissions' instead of the uid, and every
  // upload died at `new row violates row-level security policy` (the
  // RPC-direct seam tests never ride the storage endpoint).
  const { error: putErr } = await sup.storage
    .from('ppg-submissions')
    .upload(path, fileBuf, { contentType: 'application/octet-stream' })

  if (putErr)
    return { ok: false, detail: `storage_put_denied: ${putErr.message}` }

  const { error: insErr } = await sup.rpc(
    'ppg_insert_submission',
    {
      p_learner_id: uid,
      p_mission_id: moduleKey,
      p_submission_seq: seq,
      p_storage_path: path,
      p_file_magic: magic,
      p_file_size: fileBuf.byteLength,
      p_reflection: reflection,
    } as never,
  )

  if (insErr) {
    const m = insErr.message.toLowerCase()
    if (m.includes('permission_denied')) return { ok: false, detail: `permission_denied: ${insErr.message}` }
    if (m.includes('submission_size_denied')) return { ok: false, detail: `submission_size_denied: ${insErr.message}` }
    if (m.includes('append_only')) return { ok: false, detail: `append_only: ${insErr.message}` }
    return { ok: false, detail: insErr.message }
  }
  return {
    ok: true,
    submissionSeq: seq,
    storagePath: path,
    status: 'in_progress' as SubmissionCreateResult['status'],
  }
}

/**
 * The submission history read: the version-preserving history the CALLER's own
 * rows ride (append-only; the `ppg_submission_history` RPC — the CALLER's own
 * rows only, an other learner's history NEVER rides out; the order the
 * submission_seq). The resubmit APPENDS a NEW row; NOTHING overwrited.
 */
// fallow-ignore-next-line complexity
export async function readSubmissionHistoryViaRpc(moduleKey: string): Promise<SubmissionHistoryState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { status: 'denied', detail: 'module key not in the practical shape (module-08|09|10|11)' }

  const { data, error } = await sup.rpc('ppg_submission_history', { p_module_key: moduleKey } as never)

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  if (!data || !Array.isArray(data) || data.length === 0)
    return { status: 'empty', detail: 'no submission rows (the learner never submits this Mission)' }
  return { status: 'ok', submissions: data as SubmissionHistoryState['submissions'] }
}

/**
 * The signed-URL download: the owner+teacher/admin gate (RLS deny for a stranger;
 * the `ppg_signed_url_for` RPC — a short-lived (~60s) signed URL the CALLER's
 * uid rides; a stranger's download NEVER reaches the signed URL; a public bucket
 * read NEVER rides (the private bucket below). The expiry ~60s.
 */
// fallow-ignore-next-line complexity
export async function signedUrlForOwnSubmission(
  moduleKey: string,
  submissionSeq: number,
): Promise<SignedUrlResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { ok: false, detail: 'module key not in the practical shape (module-08|09|10|11)' }

  const { data, error } = await sup.rpc(
    'ppg_signed_url_for',
    { p_module_key: moduleKey, p_submission_seq: submissionSeq, p_expiry_secs: 60 } as never,
  )

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { ok: false, detail: `permission_denied: ${error.message}` }
    return { ok: false, detail: error.message }
  }

  const row = data as { url?: string; expires_in?: number }
  if (!row || !row.url) return { ok: false, detail: 'signed_url_missing' }
  return { ok: true, url: row.url, expiresIn: row.expires_in ?? 60 }
}

export interface PracticalMissionReadState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  mission?: {
    module_key: string
    scenario_th: string
    scenario_en: string
    requirements_th: string
    requirements_en: string
    expected_out_th: string
    expected_out_en: string
  }
}

/**
 * The practical mission read: the scenario/requirements/expected output the SEE-ABLE
 * practical Mission shows (the `ppg_read_practical` RPC — the CALLER's own visibility;
 * a locked/un-gated module returns `{}` server-side — the page shows the not-visible
 * state text, never a hidden form). The instructions flow from the lessons the reader
 * reads already (NOT this RPC).
 */
// fallow-ignore-next-line complexity
export async function readPracticalMissionViaRpc(moduleKey: string): Promise<PracticalMissionReadState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { status: 'denied', detail: 'module key not in the practical shape (module-08|09|10|11)' }

  const { data, error } = await sup.rpc('ppg_read_practical', { p_module_key: moduleKey } as never)

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
      scenario_th?: string
      scenario_en?: string
      requirements_th?: string
      requirements_en?: string
      expected_out_th?: string
      expected_out_en?: string
    }
    if (row.module_key && row.scenario_th && row.scenario_en)
      return { status: 'ok', mission: row as PracticalMissionReadState['mission'] }
    return { status: 'empty', detail: 'no see-able practical Mission (the gate/lock rule denies this caller)' }
  }
  return { status: 'empty', detail: 'no see-able practical Mission (the gate/lock rule denies this caller)' }
}


// The status lifecycle (in_progress -> submitted -> needs_improvement|approved,
// needs_improvement -> approved; the loop resubmit APPENDS a NEW row under a
// HIGHER submission_seq; the old row stays needs_improvement as the history) is
// the DATABASE's own `ppg_set_submission_status` authority — the client never
// decides outcomes; an invalid move reaches `invalid_transition`, a stranger's
// smuggle reaches `denied_caller`, a teacher/admin reaches `denied_role`.
//
// PPGA #18 (production verification, finding #2): the lifecycle was REAL at the
// seam yet UNREACHABLE in the browser — #13's upload only ever `create`s an
// `in_progress` row and NO route/button ever moved it to `submitted`, while
// #14's review queue reads `submitted` rows ONLY (`not_pending` otherwise). A
// production learner's upload therefore NEVER entered a Teacher's queue. The
// `submitForReviewViaRpc` below wires the learner's own move; the practical
// screen shows the button ONLY on an `in_progress` round, and the RPC's gate
// (own uid, learner role, legal transition) stays the sole authority — a
// smuggled POST reaches the raised error verbatim, never a silently-0-row move.
export interface SubmissionStatusResult {
  ok: boolean
  detail?: string
  status?: SubmissionStatus
}

// The guard shape mirrors every sibling RPC wrapper (client / session /
// shape / RPC); every branch rides the #18 e2e journey, and lib/sup has no
// vitest coverage to bring fallow's ESTIMATED CRAP down — suppressed as the
// repo's established convention (login #3, provision #6) does.
// fallow-ignore-next-line complexity
export async function submitForReviewViaRpc(
  moduleKey: string,
  submissionSeq: number,
): Promise<SubmissionStatusResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  // ONE server-verified read: `getUser` authenticates the caller's token at
  // the auth server (the storage-side `getSession` user object supabase-js
  // itself warns about never decides anything here) and carries the uid —
  // session presence and identity in a single check.
  const { data: userRes } = await sup.auth.getUser()
  const uid = userRes?.user?.id
  if (!uid) return { ok: false, detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { ok: false, detail: 'target module key not in the practical shape (module-08|09|10|11)' }

  if (!Number.isInteger(submissionSeq) || submissionSeq < 1)
    return { ok: false, detail: 'submission_seq must be a positive integer (the round number)' }

  const { data, error } = await sup.rpc(
    'ppg_set_submission_status',
    {
      p_learner_id: uid,
      p_mission_id: moduleKey,
      p_submission_seq: submissionSeq,
      p_new_status: 'submitted',
    } as never,
  )
  if (error) return { ok: false, detail: gateCodeDetail(error.message) }

  return {
    ok: true,
    // `ppg_set_submission_status` is `returns setof ppg_submission_status` —
    // PostgREST hands back a ROW SET (an array), never a bare string; the
    // naive `String(data ?? '')` coerced an object row to `[object Object]`
    // under the `as SubmissionStatus` cast. The extraction reads the first
    // row's value across the shapes a setof-enum RPC actually emits.
    status: firstStatus(data) as SubmissionStatus,
    detail: 'submitted — the Teacher queue reads this round',
  }
}

// The first row's status value: scalar string, or the record's column under
// any of the names PostgREST may give the single output column.
// fallow-ignore-next-line complexity
function firstStatus(data: unknown): string {
  const row = Array.isArray(data) ? data[0] : data
  if (typeof row === 'string') return row
  if (row && typeof row === 'object') {
    const rec = row as Record<string, unknown>
    for (const key of ['ppg_set_submission_status', 'ppg_submission_status', 'status']) {
      const v = rec[key]
      if (typeof v === 'string') return v
    }
  }
  return ''
}

// The RPC's own raised gate codes ride the detail VERBATIM (never a
// silently-0-row move); any other message rides unwrapped.
const GATE_CODES = ['denied_caller', 'denied_role', 'invalid_transition', 'submission_missing']

function gateCodeDetail(message: string): string {
  const lowered = message.toLowerCase()
  const code = GATE_CODES.find((c) => lowered.includes(c))
  return code ? `${code}: ${message}` : message
}
/**
 * Ticket #45 (#41 stage 4): the practical-mission module set the challenge
 * framing reads to know WHICH screen a module's Mission is (upload vs
 * knowledge attempt) — the same catalog list the dashboard hub reads for the
 * current-Mission link. A plain read-only SELECT through the caller's session
 * JWT (the shipped SELECT grants every signed-in role this content catalog;
 * no service-role, no rule, no write). Missing env yields `not-configured`,
 * a missing session `unauthorized` — the page speaks the state, never guesses.
 */
export interface PracticalMissionKeysRead {
  status: 'ok' | 'error' | 'not-configured' | 'unauthorized'
  detail?: string
  keys?: string[]
}

export async function readPracticalMissionKeysViaTable(): Promise<PracticalMissionKeysRead> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup.from('ppg_practical_missions').select('module_key')
  if (error) return { status: 'error', detail: error.message }
  return { status: 'ok', keys: ((data ?? []) as Array<{ module_key: string }>).map((r) => r.module_key) }
}
