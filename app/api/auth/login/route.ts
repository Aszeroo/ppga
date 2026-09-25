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

  const res = NextResponse.json({ ok: true, detail: 'signed in', redirect: '/profile' })
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
  return res
}
