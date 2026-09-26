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
    .select('must_change_password, consent, prettest_unlocked_override')
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
  // Ticket #8 gate status: the consent flag + the override flag live in the
  // DATABASE (the profiles columns) and the submission state rides the
  // response's own row (the single-attempt PK: a learner never has more than
  // one response row). The read rides the CALLER's own JWT + RLS (the
  // learner's own-row policies grant exactly their own row — a smuggled gate
  // value from the browser can never pass this read). The flags ride httpOnly
  // cookies (a client script can never clear or smuggle them; the login
  // route's read of the DATABASE's flags already spoke) so the middleware
  // can speak the deeper redirect on any other pathname, and the gate's
  // server-side authority (the content policy + the RLS) decides outcome —
  // never a hidden UI. A failed gate read is `false`/`false`/`un-submitted`
  // by default (no blank screen; the next read speaks again).
  const gateRows = flagRows && flagRows.length === 1 ? (flagRows as Array<{
    must_change_password: boolean
    consent: boolean
    prettest_unlocked_override: boolean
  }>) : null
  const consent =
    gateRows && gateRows.length === 1 && typeof gateRows[0].consent === 'boolean'
      ? (gateRows[0].consent as boolean)
      : false
  const override =
    gateRows && gateRows.length === 1 && typeof gateRows[0].prettest_unlocked_override === 'boolean'
      ? (gateRows[0].prettest_unlocked_override as boolean)
      : false
  // The submission state rides the response's own row (the single-attempt
  // PK: no row to read means never a submit; the filter narrows to the
  // CALLER's own `learner_id = auth.uid()` — the read of the teacher/admin
  // every row now resolves to their own one row).
  const { data: resRows, error: resError } = await sup
    .from('ppg_pretest_responses')
    .select('submitted_at')
    .filter('learner_id', 'learner_id', data.user.id)
    .limit(1)
  const submitted =
    resRows && resRows.length === 1 && resRows[0].submitted_at != null &&
    !resError
  // A `not-configured` / RLS-deny on the responses read is un-submitted by
  // default (no blank screen; the next read speaks again).
  // The #7 first-login force-change gate speaks first (flag verbatim — a
  // flagged account must change its password BEFORE anything else). The
  // Ticket #8 gate then speaks: a Learner without consent sees the
  // dashboard's respectful explanation and no access to the Pre-Test; a
  // consenting un-submitted Learner sees the Pre-Test screen only (the
  // #10 story — content stays locked server-side until submit); a
  // submitted (or audited-override — the #54 story) Learner sees the
  // locked-content placeholder (the override is what opened the gate,
  // not a submit).
  let gateRedirect = '/profile'
  if (flag) gateRedirect = '/change-password'
  else if (!consent) gateRedirect = '/'
  else if (consent && !submitted && !override) gateRedirect = '/pre-test'
  // The gate flags ride httpOnly cookies so the middleware can speak the
  // deeper redirect on any pathname, and the change-password/login pathname
  // is the allowlist the #3 guard already carries.

  const res = NextResponse.json({
    ok: true,
    detail:
      gateRedirect === '/change-password'
        ? 'signed in; password change forced'
        : gateRedirect === '/'
        ? 'signed in; no consent — the explanation is the next action'
        : gateRedirect === '/pre-test'
        ? 'signed in; Pre-Test only (content locked server-side until submit)'
        : 'signed in; gate opened (content readable server-side)',
    redirect: gateRedirect,
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
  // Ticket #8 gate flags ride httpOnly cookies so the middleware (the #3
  // guard's pathname allowlist already carries the login/change-password
  // pathnames) can speak the deeper redirect on any other pathname: an
  // unconsented Learner goes back to the dashboard's respectful explanation,
  // a consenting un-submitted Learner goes back to the Pre-Test pathname,
  // and the content pathname is denied by the DATABASE's own gate — never
  // a hidden UI. The flags are cleared on a later logout / re-read on the
  // next login (the DATABASE's own flags, never a client-side value,
  // decide this redirect).
  if (consent) {
    res.cookies.set('ppga_consent', '1', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })
  }
  if (override) {
    res.cookies.set('ppga_pretest_unlocked', '1', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24 * 7,
    })
  }
  if (submitted) {
    res.cookies.set('ppga_pretest_submitted', '1', {
      path: '/',
      httpOnly: true,
      secure: true,
      sameSite: 'lax',
      maxAge: 60 * 60 * 24,
    })
  }
  return res
}
