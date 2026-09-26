import { NextRequest, NextResponse } from 'next/server'

import {
  changePasswordViaSupaHttp,
  changePasswordFormSchema,
  createSupaSessionClientForRoute,
} from '../../../../lib/sup/auth'

/**
 * Ticket #3 change-password: a signed-in user swaps their password at the
 * Supabase Auth service via PUT /auth/user. The form is Zod-valid before we
 * touch Auth; a weak-password/reauthentication/same-password gate maps to
 * observable state (the response carries the service's message verbatim).
 *
 * `force-dynamic` so `next build` never pre-render this POST — the endpoint is
 * only real once a live Supabase Auth is configured.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const parsed = changePasswordFormSchema.safeParse(
    await req
      .json()
      .catch(() => ({}) as never), // malformed body => `{}` fails the Zod check below
  )

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  // The supa call here only reads the request cookie; password changes do not
  // rotate the session cookie, so the factory receives no response object.
  const sup = createSupaSessionClientForRoute(req)
  if (!sup) return NextResponse.json({ ok: false, detail: 'not-configured' })

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return NextResponse.json({ ok: false, detail: 'no session' })

  const viaHttp = await changePasswordViaSupaHttp(
    session.session.access_token,
    parsed.data.newPassword,
    parsed.data.currentPassword,
  )

  // Ticket #7 first-login force-change completion: the Auth service's PUT
  // landed the new password (the temp password is now spent — one-time by
  // construction), so the DATABASE's flag may clear too — the CALLER's own
  // JWT + the profiles' UPDATE policy (own-row) speaks the write (a
  // service-side smuggle can never clear someone else's flag; a denied read
  // is a 0-row UPDATE by the table itself, observable as `false` below). The
  // httpOnly flag cookie is cleared on the same success path so the
  // middleware's redirect can speak `/profile` verbatim from now on.
  const res = NextResponse.json(viaHttp)
  if (viaHttp.ok) {
    const { error: clearError } = await sup
      .from('ppg_profiles')
      .update({ must_change_password: false })
      // The caller's own row only: an admin/teacher may UPDATE EVERY profile
      // row under their SELECT/UPDATE policy (#3's admin-write-all + the
      // teacher's own-row), so an unfiltered UPDATE here would clear the
      // one-time-flag on every provisioned learner still awaiting their
      // first-login change. The filter narrows to `id = auth.uid()`.
      .filter('id', 'id', session.session.user.id)
    // A clear-read failure (RLS deny / a PostgREST error) never reverses the
    // PUT's success (the password IS the new one now) — the flag waits for the
    // next attempt; the next login's flag read below re-sends the redirect.
    // The cookie is cleared either way (the flag's `true` value is spent
    // regardless; the middleware re-reads the DATABASE on the next login).
    res.cookies.set('ppga_must_change_password', '', { path: '/', maxAge: 0 })
    if (clearError) {
      // The observable note only lands in `detail`'s body (the DATABASE read
      // failed — the next login's flag read below speaks the redirect again),
      // never a blank screen.
      return NextResponse.json({ ...viaHttp, detail: `${viaHttp.detail}; flag read: ${clearError.message}` })
    }
  }
  return res
}
