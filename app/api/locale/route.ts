import { ZodIssue } from 'zod'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

import { createSupaSessionClientForRoute } from '../../../lib/sup/auth'
import { updateOwnLocale } from '../../../lib/sup/profile'
import { localeSchema } from '../../../lib/i18n/localeSchema'

/**
 * Ticket #4 locale persistence: the client selector POSTs its choice here so
 * the learner's profile row remembers the language — the profile outlasts the
 * httpOnly session cookies, so after logout and re-login the platform still
 * knows which language was chosen. RLS: a learner updates only their own row
 * (Ticket #3's `ppg_profiles_update` policy); the cookie is written by the
 * routing middleware (`ppga-locale`), never by this route.
 *
 * `force-dynamic` so `next build` never pre-render this POST. A missing
 * session or a not-configured service carries the message verbatim so the UI
 * shows an error state, never a blank screen.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const body = await req
    .json()
    .catch(() => ({}) as never)

  const parsed = localeSchema.safeParse(body)

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i: ZodIssue) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const sup = createSupaSessionClientForRoute(req)
  if (!sup) {
    return NextResponse.json({ ok: false, detail: 'not-configured' })
  }

  const result = await updateOwnLocale(sup as ReturnType<typeof createClient>, parsed.data.locale)

  return NextResponse.json(result)
}
