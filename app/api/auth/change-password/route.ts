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
  return NextResponse.json(viaHttp)
}
