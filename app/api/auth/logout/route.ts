import { NextRequest, NextResponse } from 'next/server'

import {
  createSupaSessionClientForRoute,
  logoutFormSchema,
  signOutViaSupaHttp,
} from '../../../../lib/sup/auth'

/**
 * Ticket #3 logout: the refresh token is revoked at the Supabase Auth service
 * and both session cookies are cleared on `/` so a later request carries no
 * authority. A missing service still clears the cookie (the observable state is
 * "signed out, service unavailable", not a blank screen).
 *
 * `force-dynamic` so `next build` never pre-render this POST.
 */
export const dynamic = 'force-dynamic'

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

  const sup = createSupaSessionClientForRoute(req)
  if (!sup) {
    return NextResponse.json({ ok: false, detail: 'not-configured' })
  }

  const { data: session } = await sup.auth.getSession()
  const revoked = session && session.session
    ? await signOutViaSupaHttp(session.session.refresh_token)
    : { ok: true, detail: 'no session to revoke' }

  const res = NextResponse.json(revoked)
  res.cookies.set('ppga_session', '', { path: '/', maxAge: 0 })
  res.cookies.set('ppga_refresh', '', { path: '/', maxAge: 0 })
  // supa-js's own storage key is cleared too so a stale bundle can never be
  // restored server-side on a later request.
  res.cookies.set('supabasejs', '', { path: '/', maxAge: 0 })
  // Ticket #7: the must-change flag cookie is cleared on the same path so a
  // logout's next login speaks its own flag read verbatim (no stale `1`
  // redirecting a new sign-in before anything else).
  res.cookies.set('ppga_must_change_password', '', { path: '/', maxAge: 0 })
  return res
}
