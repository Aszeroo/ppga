import createMiddleware from 'next-intl/middleware'

import { NextRequest, NextResponse } from 'next/server'

import { locales, type Locale } from './lib/i18n/locales'
import { routing } from './lib/i18n/routing'

/**
 * Ticket #3 guard + Ticket #4 i18n, in one file — they must coexist on the
 * same pathname.
 *
 * Order: the guard speaks first so the role-proof (the session cookie) decides
 * before any locale redirect; a protected pathname without the proof goes back
 * to `/<locale>/login` (the unauthorized state is the login page, never a blank
 * screen) and keeps the locale the pathname already carries. The i18n
 * middleware then does the `[locale]` rewrite, the default `/` → `/th`, the
 * `/en` explicit switch, and writes the `ppga-locale` cookie (routing.ts).
 *
 * `middleware.ts` is live by definition; Next never pre-renders it.
 */
const protectedRoutes = ['/profile', '/change-password', '/logout', '/admin/users', '/admin/audit', '/admin/provisioning', '/pre-test', '/course', '/admin/publication', '/content']
const sessionCookie = 'ppga_session'
const mustChangeCookie = 'ppga_must_change_password'
const consentCookie = 'ppga_consent'
const unlockedCookie = 'ppga_pretest_unlocked'
const submittedCookie = 'ppga_pretest_submitted'

// fallow-ignore-next-line complexity
export default function middleware(req: NextRequest) {
  const pathname = new URL(req.url).pathname
  const locale = localeFromPathname(pathname)
  const hasSession = Boolean(req.cookies.get(sessionCookie)?.value)
  const mustChange = Boolean(req.cookies.get(mustChangeCookie)?.value)

  if (!hasSession && protectedRoutes.some((route) => pathname.startsWith(`/${locale}${route}`) || pathname.startsWith(route))) {
    return NextResponse.redirect(new URL(`/${locale}/login`, req.url))
  }

  // Ticket #7 first-login force-change gate, in one with the #3 guard: a
  // signed-in account whose first login carried the one-time temp password
  // (`ppga_must_change_password` rides the httpOnly cookie the login route
  // set from the DATABASE's `must_change_password` flag under the CALLER's
  // own JWT + RLS) may reach ONLY the change-password pathname (or logout) —
  // BEFORE anything else: any other pathname goes back to
  // `/<locale>/change-password` and keeps the locale the pathname already
  // carries. The change-password route clears the flag + the cookie on
  // success, so the next pathname speaks `/profile` verbatim. The cookie
  // (httpOnly — a client script can never clear or smuggle it; the login
  // route's read of the DATABASE's flag already spoke), never a client-side
  // value, decides this redirect. The /api + locale-switch paths are never
  // gated here (the matcher already leaves `/api` alone out; the change-
  // password's own pathname is the allowlist).
  if (hasSession && mustChange && !pathname.startsWith(`/${locale}/change-password`) && !pathname.startsWith(`/${locale}/logout`) && pathname !== `/${locale}`) {
    return NextResponse.redirect(new URL(`/${locale}/change-password`, req.url))
  }

  // Ticket #8 gate guard, in one with the #3 guard + #7 force-change: the
  // gate flags ride httpOnly cookies the login route set from the DATABASE's
  // own flags under the CALLER's own JWT + RLS (a client script can never
  // clear or smuggle them; the login route's read of the DATABASE already
  // spoke). A signed-in Learner without consent sees the dashboard's
  // respectful explanation and no access to the Pre-Test — any other
  // pathname goes back to `/<locale>` (the no-consent state). A consenting
  // un-submitted Learner reaches ONLY the Pre-Test pathname (or logout/
  // change-password/profile the allowlist the #3 guard carries): the
  // content pathname goes back to `/<locale>/pre-test` until the response
  // is submitted — content is INACCESSIBLE server-side before the gate
  // opens (the DATABASE's own policy denies the read at the row level;
  // the redirect here is the UI's state, never a hidden UI that the
  // smuggle could pass). An audited override (`ppga_pretest_unlocked`)
  // bypasses the gate to the locked-content placeholder for that
  // Learner alone — the override is what opened the gate, not a submit.
  const consent = Boolean(req.cookies.get(consentCookie)?.value)
  const unlocked = Boolean(req.cookies.get(unlockedCookie)?.value)
  const submitted = Boolean(req.cookies.get(submittedCookie)?.value)
  const unlockedGateOpen = unlocked || submitted
  if (hasSession && !mustChange) {
    if (!consent && !pathname.startsWith(`/${locale}/login`) && !pathname.startsWith(`/${locale}/logout`) && pathname !== `/${locale}`) {
      return NextResponse.redirect(new URL(`/${locale}`, req.url))
    }
    if (consent && !unlockedGateOpen && (pathname.startsWith(`/${locale}/content`) || pathname.startsWith(`/${locale}/course`))) {
      return NextResponse.redirect(new URL(`/${locale}/pre-test`, req.url))
    }
  }

  const response = createMiddleware(routing)(req)
  return response
}

/** `[locale]` segment at the head of the pathname; absent => the default. */
function localeFromPathname(pathname: string): Locale | undefined {
  const head = pathname.split('/').at(1) ?? ''
  return locales.includes(head as Locale) ? (head as Locale) : 'th'
}

export const config = {
  // Every pathname except the API routes (they carry JSON, not copy) and the
  // Next's internal build assets.
  matcher: '/((?!api|_next|trfc|.*\\..*).*)',
}