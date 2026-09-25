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
const protectedRoutes = ['/profile', '/change-password', '/logout']
const sessionCookie = 'ppga_session'

export default function middleware(req: NextRequest) {
  const pathname = new URL(req.url).pathname
  const locale = localeFromPathname(pathname)
  const hasSession = Boolean(req.cookies.get(sessionCookie)?.value)

  if (!hasSession && protectedRoutes.some((route) => pathname.startsWith(`/${locale}${route}`) || pathname.startsWith(route))) {
    return NextResponse.redirect(new URL(`/${locale}/login`, req.url))
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
