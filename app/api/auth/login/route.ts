import { NextRequest, NextResponse } from 'next/server'

import {
  createSupaSessionClientForRoute,
  loginFormSchema,
  syntheticEmail,
} from '../../../../lib/sup/auth'

/**
 * Ticket #3 login: a learner/teacher/admin signs in with their provisioned
 * handle (student-ID for learners) and password against the real Supabase
 * Auth service. The session's token bundle lands in a httpOnly, SameSite=cuda
 * cookie on `/` — the refresh token never reaches the browser or localStorage.
 * No self-registration route exists anywhere in the app (README: "No self-registration").
 *
 * `force-dynamic` so `next build` never pre-render this POST. A failure carries
 * the service message verbatim so the UI shows an error state, never a blank
 * screen.
 */
export const dynamic = 'force-dynamic'

// fallow-ignore-next-line complexity
export async function POST(req: NextRequest) {
  const body = await req
    .json()
    .catch(() => ({}) as never)

  const parsed = loginFormSchema.safeParse(body)

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

  const { error, data } = await sup.auth.signInWithPassword({
    email: syntheticEmail(parsed.data.identifier),
    password: parsed.data.password,
  })

  if (error || !data) {
    return NextResponse.json({
      ok: false,
      detail: error?.message ?? 'empty session',
    })
  }

  // Ticket #7 first-login force-change gate: the account's `must_change_
  // password` flag lives in the DATABASE (the profiles column) and the read
  // rides the CALLER's own JWT + RLS (the learner's own-row select policy
  // grants exactly their own row — a smuggled `must_change_password` value
  // from the browser can never pass this read). The flag is `true` only for a
  // provisioned learner (the #7 finalize's metadata rewrite + the trigger's
  // `coalesce((meta->>'must_change_password')::boolean, false)`); the #3
  // seeded accounts never have it. A flagged account's first login must set a
  // new password BEFORE anything else — the redirect below speaks `/
  // change-password` first, and the httpOnly cookie carries the flag to the
  // middleware (the deeper redirect on any other pathname).
  const { data: flagRows, error: flagError } = await sup
    .from('ppg_profiles')
    .select('must_change_password')
    // The caller's own row only: a teacher/admin sees EVERY profile row under
    // their SELECT policy (#3's admin/teacher read-all), so an unfiltered
    // `limit(1)` here would pick some OTHER provisioned learner's `true` flag
    // and force the ADMIN/TEACHER themself to change their password on a
    // unrelated row's metadata. The filter narrows to `id = auth.uid()` — the
    // learner's own-row RLS read already restricts them to their own row; the
    // admin/teacher's read of every row now resolves to their own one row.
    .filter('id', 'id', data.user.id)
    .limit(1)
  const flag =
    flagRows && flagRows.length === 1 && typeof flagRows[0].must_change_password === 'boolean'
      ? (flagRows[0].must_change_password as boolean)
      : false
  // A failed profiles read (RLS deny / not-configured / a PostgREST error) is
  // a `false` by default — the login still stands (no blank screen), the
  // first-login redirect waits for the next read (a later login's own read).

  const res = NextResponse.json({
    ok: true,
    detail: flag ? 'signed in; password change forced' : 'signed in',
    redirect: flag ? '/change-password' : '/profile',
  })
  // The refresh/access tokens ride httpOnly cookies set here, not in the body.
  res.cookies.set('ppga_session', data.session.access_token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  })
  res.cookies.set('ppga_refresh', data.session.refresh_token, {
    path: '/',
    httpOnly: true,
    secure: true,
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 7,
  })
  // The must-change flag rides a third httpOnly cookie so the middleware (the
  // pathname's unauthorized state already goes to login) can speak the deeper
  // redirect on any other pathname, and the change-password route clears it on
  // success (the first-login force-change completes before anything else).
  if (flag) {
    res.cookies.set('ppga_must_change_password', '1', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })
  }
  return res
}
