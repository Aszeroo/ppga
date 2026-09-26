import 'server-only'

import { createClient } from '@supabase/supabase-js'
import { cookies } from 'next/headers'
import { z } from 'zod'

import {
  fullNameSchema,
  genTempPassword,
  parseRoster,
  provisionLineSchema,
  syntheticEmail,
  studentIdSchema,
  type ProvisionLine,
  type ProvisionLineStatus,
} from '../provision/roster'

// Re-export the pure logic so the route's/page's imports stay one module (the
// guard's boundary is ours, the logic's tests run in jsdom).
export {
  genTempPassword,
  parseRoster,
  provisionLineSchema,
  syntheticEmail,
}
export type { ProvisionLine, ProvisionLineStatus }

/**
 * Ticket #7 provisioning server module: the roster paste + the single-add
 * fallback and the one-time temp password + the provision-audit RPC all run
 * here. The #6 pattern stays for the DB path: the finalize call carries the
 * request's user JWT so the function's own gate (admin/teacher) + the audit
 * table's INSERT policy decide — a learner smuggles the POST as
 * `permission_denied`, never a roster they did not get.
 *
 * The LEGIT service-role use: the Supabase Auth ADMIN API (`createUser`) can
 * only be reached with the SERVICE-ROLE key, and only server-side — this
 * module is that single legitimate place; every DB read/write still rides the
 * user JWT + RLS (no service-role). Missing environment yields `null` so the
 * provisioning page can show "not-configured" instead of crashing.
 *
 * The pure roster/password/synthetic-email logic lives in `lib/provision/roster
 * .ts` (outside this guard so the unit tests can import it verbatim — Vitest's
 * jsdom env makes `server-only` throw for every import); we re-export it so
 * the route's imports stay one module.
 */

export const rosterFormSchema = z
  .object({
    roster: z.string().max(4096 * 2), // a 30-line paste (or a larger class list) stays under the body cap
  })
  .strict()

export const singleFormSchema = z
  .object({
    student_id: studentIdSchema,
    full_name: fullNameSchema,
  })
  .strict()

export interface ProvisionState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'unauthorized'
    | 'not-configured'
  detail?: string
  lines?: ProvisionLine[]
}

/** The service-role client — the LEGIT service-role use, server-only (this
 * module carries `import 'server-only'`). It bypasses RLS for the Auth admin
 * API only (`createUser`) + for the finalize's own UPDATE of `auth.users.role`
 * (a later step) — every DB read/write still rides the user JWT. Missing env
 * yields `null` so the page can show "not-configured". */
export function createSupaServiceClient() {
  const url = process.env.SUP_URL ?? process.env.NEXT_PUBLIC_SUP_URL
  const key = process.env.SUP_SERVICE_ROLE_KEY
  if (!url || !key) return null
  return createClient(url, key, {
    // The admin API never lands a session token in the browser (there is no
    // user here to hold a cookie — `createUser` returns the created user
    // object, not a sign-in session).
    auth: { persistSession: false, autoRefreshToken: false },
  })
}

/** The Supa Auth admin API's `createUser` — the ONE legitimate service-role
 * use (server-side only, the browser never sees this module or the key). The
 * attributes land as: a synthetic email (the #3 handle scheme), a
 * one-time temp password, the `user_metadata` that seeds the profile trigger
 * (student_id + full_name + role + `must_change_password` true — the flag the
 * migration's ALTER + trigger re-write carry), `email_confirm: true` (no
 * email to confirm; the account must sign in immediately). The created
 * account's `role` claim is still gotrue's default (`authenticated`) until
 * the finalize RPC below rewrites it to `learner`. */
export async function createUserViaAdminApi(
  studentId: string,
  fullName: string,
  tempPassword: string,
): Promise<{ ok: boolean; detail?: string; id?: string }> {
  const sup = createSupaServiceClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data, error } = await sup.auth.admin.createUser({
    email: syntheticEmail(studentId),
    password: tempPassword,
    email_confirm: true,
    user_metadata: {
      student_id: studentId,
      full_name: fullName,
      role: 'learner',
      must_change_password: true,
    },
  })

  if (error) return { ok: false, detail: error.message }
  if (!data || !data.user?.id) return { ok: false, detail: 'empty created user' }
  return { ok: true, detail: 'account created', id: data.user.id }
}

/** The session client factory for the finalize's DB path: the user's JWT
 * (from the request's cookie jar) is the only authority — we do NOT carry the
 * service-role key for the audit RPC; the function's own gate + the audit
 * table's INSERT policy speak. Missing env yields `null`. */
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

/** The provision-audit RPC (#7's migration): one call — one UPDATE of the
 * created account's role claim + exactly one audit INSERT. The gate reads the
 * request's JWT (admin OR teacher); a learner smuggles the call as
 * `permission_denied`, never a silently-0-row finalize. */
export async function provisionFinalizeViaRpc(
  targetId: string | null,
  studentId: string,
  fullName: string,
  lineResult: ProvisionLine['result'],
): Promise<{ ok: boolean; detail?: string }> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  const { error } = await sup.rpc(
    'ppg_provision_finalize',
    {
      p_target_id: targetId ?? undefined,
      p_student_id: studentId,
      p_full_name: fullName,
      p_line_result: lineResult,
    } as never,
  )

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { ok: false, detail: `permission_denied: ${error.message}` }
    return { ok: false, detail: error.message }
  }
  return { ok: true, detail: 'role claim stored; one audit event written' }
}

/** The caller's role from the request's JWT — the provision gate's own
 * authority (the access token came from the Supa Auth service, so its role
 * claim is the RLS' same claim; never a client-provided value). We parse the
 * payload base64 — not verify the signature (the Auth service already did
 * that when it issued the token to the sign-in flow). Learner/other role:
 * `denied` before ANY create; admin/teacher: `ok` — may provision; no
 * session: `unauthorized`; no env: `not-configured`. */
export async function provisionGate(): Promise<{
  kind: 'ok' | 'denied' | 'unauthorized' | 'not-configured'
  role?: 'admin' | 'teacher'
}> {
  const sup = await createSupaSessionClient()
  if (!sup) return { kind: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { kind: 'unauthorized' }

  const jwt = session.session.access_token
  const payload = jwt.split('.').at(1)
  if (!payload) return { kind: 'unauthorized' }
  try {
    // The JWT payload segment is base64 (possibly unpadded); we normalize the
    // URL-safe alphabet (`_` -> `.`, `%20` -> ' ') + pad to a %4 boundary so
    // `Buffer.from(...,'base64')` can decode it.
    const b = payload.replace(/_/g, '').replace(/%20/g, ' ')
    const pad = 4 - (b.length % 4)
    const padded = b.padEnd(b.length + pad, '=')
    const claims = JSON.parse(Buffer.from(padded, 'base64').toString('utf8')) as { role?: string; sub?: string }
    const role = claims?.role
    return role === 'admin' || role === 'teacher' ? { kind: 'ok', role } : { kind: 'denied' }
  } catch {
    return { kind: 'unauthorized' }
  }
}

/** The caller's roster check against the existing accounts: the profiles
 * table read under the CALLER's JWT — the teacher/admin sees every row (the
 * #3 select policy), so a handle that already has a profile row is an
 * `duplicate` line; the learner caller's read filters to their own row (and
 * the gate above denied them BEFORE the create path anyway). */
export async function existingHandles(): Promise<string[]> {
  const sup = await createSupaSessionClient()
  if (!sup) return []

  const { data, error } = await sup.from('ppg_profiles').select('student_id').limit(1000)
  if (error) return []
  return (data ?? []).map((row: { student_id?: string }) => row.student_id).filter((x) => x != null) as string[]
}
