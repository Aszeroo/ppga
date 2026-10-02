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
const protectedRoutes = ['/profile', '/change-password', '/logout', '/admin/users', '/admin/audit', '/admin/provisioning', '/pre-test', '/post-test', '/survey', '/course', '/admin/publication', '/admin/export', '/content']
const sessionCookie = 'ppga_session'
const mustChangeCookie = 'ppga_must_change_password'
const consentCookie = 'ppga_consent'
const unlockedCookie = 'ppga_pretest_unlocked'
const submittedCookie = 'ppga_pretest_submitted'

// fallow-ignore-next-line complexity
export default function middleware(req: NextRequest) {
  const pathname = new URL(req.url).pathname
  const locale = resolveLocale(pathname, req.cookies.get('ppga-locale')?.value, req.headers.get('accept-language'))
  const hasSession = Boolean(req.cookies.get(sessionCookie)?.value)
  const mustChange = Boolean(req.cookies.get(mustChangeCookie)?.value)

  // PPGA #18 (the language sweep, AC "Thai default"): the anonymous caller's
  // landing at the bare root is the platform's Thai-first default — never the
  // accept-language guess (a fresh browser with English headers must not be
  // silently routed to English before the caller ever chose a language). An
  // EXPLICIT choice still wins: the `ppga-locale` cookie outlives logout
  // (routing.ts), so a caller who once switched lands on their locale here.
  // A signed-in caller never rides this rule — the login route's locale-
  // neutral gate redirect lands on `/` and must resolve through the full
  // chain (the EN journey's no-cookie empty jar; see resolveLocale).
  if (!hasSession && pathname === '/' && !req.cookies.get('ppga-locale')?.value) {
    return NextResponse.redirect(new URL('/th', req.url))
  }

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
  // PPGA #18 (production verification, finding #3): the #8 consent gate is a
  // LEARNER's gate — paper consent is the research-participant's own flag
  // (the profile comment says it verbatim), while the guard as #8 shipped it
  // redirects EVERY signed-in user who lacks consent off every pathname but
  // login/logout/root. In the real app that proved UNBOLING: every seeded
  // Admin/Teacher holds `consent = false` (the profile trigger's coalesce
  // default — staff never sign participant papers), so the Admin could never
  // reach `/admin/users` to SET the consent flag, and a Teacher could never
  // reach `/teacher/review`. The authority for the gate stays exactly where
  // it belongs (the DATABASE's RLS + gate functions deny an unconsented
  // LEARNER's reads/writes at the row level, unchanged); the UI's redirect is
  // scoped to its own role now: the session JWT's payload (never its
  // signature — UI routing only; the row-level RLS still decides every read
  // on its own verified claims) names the CALLER's role, and only a learner
  // (or a payload that never decodes — the safe default) rides the gate.
  const gateRole = jwtRole(req.cookies.get(sessionCookie)?.value)
  if (hasSession && !mustChange && (gateRole == null || gateRole === 'learner')) {
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

/**
 * PPGA #18 (the EN SSR bug): the guard's locale follows next-intl's documented
 * detection priorities so the UI's redirects and the routing middleware never
 * disagree on a pathname: 1. a locale prefix on the pathname wins; 2. the
 * `ppga-locale` cookie the routing middleware syncs on a switch; 3. the
 * `accept-language` header; 4. the platform default `th`.
 *
 * The cookie ALONE cannot decide a prefixless pathname (`/` — where the login
 * route's locale-neutral gate redirect lands): next-intl deliberately does NOT
 * write the cookie when the request already matches the detected locale
 * (middleware/syncCookie: no cookie + `accept-language` equals the locale =>
 * nothing set), so a fresh English browser sits at `/en/login` with NO cookie,
 * and a cookie-only fallback sent the post-login `/` to `/th` (the journey's
 * EN failure; the browser probe at /tmp confirmed the empty jar). The guard
 * must therefore consult the same chain next-intl itself uses.
 */
function resolveLocale(pathname: string, cookieLocale: string | undefined | null, acceptLanguage: string | null): Locale {
  const candidates = [
    pathname.split('/').at(1),
    cookieLocale ?? '',
    ...(acceptLanguage ?? '').split(',').map((range) => range.trim().split(';')[0].toLowerCase().split('-')[0]),
  ]
  return (candidates.find((candidate) => locales.includes(candidate as Locale)) as Locale) ?? 'th'
}

/**
 * PPGA #18 (finding #3): the JWT payload's `role` claim, UI-routing-only.
 * The `ppga_session` cookie carries the stored-session JSON (#18's finding
 * #4 fix) whose `access_token` holds the claim; the raw-JWT form is still
 * read for any pre-#4 cookie. NO signature verification (the middleware
 * never trusts it as authority; the DATABASE's RLS + gate functions
 * evaluate the request's own verified claims at the row level, always). A
 * payload that never decodes / carries no `role` yields `null` — the safe
 * default keeps the UI's gate (the unconsented learner's state) running
 * for that caller.
 */
function jwtRole(cookie: string | undefined | null): string | null {
  const token = accessTokenFromCookie(cookie)
  const payload = token?.split('.').at(1)
  if (!payload) return null
  const claims = decodeJwtPayload(payload)
  return typeof claims?.role === 'string' ? claims.role : null
}

/** The JWT inside the stored-session JSON (`access_token`), or the raw-JWT
 * cookie verbatim (pre-#4 form). A garbage/missing `access_token` yields a
 * string with no payload segment — the `null` jwtRole already means. */
function accessTokenFromCookie(cookie: string | undefined | null): string | null {
  if (!cookie) return null
  if (!cookie.startsWith('{')) return cookie
  try {
    return String((JSON.parse(cookie) as { access_token?: unknown }).access_token)
  } catch {
    return null
  }
}

/** Base64url-decodes the payload segment to its claims JSON (or `null`). */
function decodeJwtPayload(payload: string): { role?: string } | null {
  try {
    const base64 = payload.replaceAll('-', '+').replaceAll('_', '/') +
      '='.repeat((4 - (payload.length % 4)) % 4)
    return JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as { role?: string }
  } catch {
    return null
  }
}

export const config = {
  // Every pathname except the API routes (they carry JSON, not copy) and the
  // Next's internal build assets.
  matcher: '/((?!api|_next|trfc|.*\\..*).*)',
}