import { NextRequest, NextResponse } from 'next/server'

import {
  createSupaSessionClientForRoute,
  logoutFormSchema,
  signOutViaSupaHttp,
} from '../../../../lib/sup/auth'

/**
 * Ticket #3 logout: the session is revoked at the Supabase Auth service (the
 * #49-corrected call: POST /auth/v1/logout Bearer-authenticated by the access
 * token) and both session cookies are cleared on `/` so a later request
 * carries no authority. A refused or unreachable revoke still clears the
 * cookies (the observable state is "signed out, service said otherwise",
 * never a stuck signed-in caller), and a missing environment still renders
 * not-configured.
 *
 * `force-dynamic` so `next build` never pre-render this POST.
 */
export const dynamic = 'force-dynamic'

// fallow-ignore-next-line complexity
export async function POST(req: NextRequest) {
  const body = await req
    .json()
    .catch(() => ({}) as never)

  const parsed = logoutFormSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const sup = await createSupaSessionClientForRoute(req)
  if (!sup) {
    return NextResponse.json({ ok: false, detail: 'not-configured' })
  }

  // PPGA #49 (the owner preview's `logout failing`): the service revoke is
  // best-effort and speaks through the ACCESS token (POST /auth/v1/logout is
  // a Bearer-authenticated endpoint). What NEVER depends on it is the
  // observable sign-out below: every session cookie clears even when the
  // service refuses (revoked token, unreachable, expired JWT), because a
  // refused revoke must leave the caller signed OUT with a reported detail,
  // never stuck signed IN.
  const { data: session } = await sup.auth.getSession()
  const revoked = session && session.session
    ? await signOutViaSupaHttp(session.session.access_token)
    : { ok: true, detail: 'no session to revoke' }

  const res = NextResponse.json(
    revoked.ok ? revoked : { ok: true, detail: revoked.detail, redirect: '/' },
  )
  res.cookies.set('ppga_session', '', { path: '/', maxAge: 0 })
  res.cookies.set('ppga_refresh', '', { path: '/', maxAge: 0 })
  // supa-js's own storage key is cleared too so a stale bundle can never be
  // restored server-side on a later request.
  res.cookies.set('supabasejs', '', { path: '/', maxAge: 0 })
  // Ticket #7: the must-change flag cookie is cleared on the same path so a
  // logout's next login speaks its own flag read verbatim (no stale `1`
  // redirecting a new sign-in before anything else).
  res.cookies.set('ppga_must_change_password', '', { path: '/', maxAge: 0 })
  // PPGA #18 (the live journey): the #8 gate flags ride the SAME login-time
  // pattern, so the SAME rule applies — a logout clears them too and the next
  // login re-reads the DATABASE's own flags (consent can be recorded/revoked,
  // the Pre-Test submitted BETWEEN sessions; a stale `1` cookie must never
  // keep a signed-out identity's gate state alive in the UI between logins).
  res.cookies.set('ppga_consent', '', { path: '/', maxAge: 0 })
  res.cookies.set('ppga_pretest_unlocked', '', { path: '/', maxAge: 0 })
  res.cookies.set('ppga_pretest_submitted', '', { path: '/', maxAge: 0 })
  return res
}
