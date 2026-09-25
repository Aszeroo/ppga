import { NextRequest, NextResponse } from 'next/server'

/**
 * Ticket #3 middleware guard: the session cookie is the only thing that
 * proves a learner/teacher/admin exists. Every role-protected route
 * (/profile, /change-password, /logout) without that proof redirects to
 * /login — the UI shows the unauthorized state (the login page), never a blank
 * screen. Public routes (/, /health, /login, /api/*) pass through untouched.
 * No /signup route exists — there is nothing for this guard to allow.
 *
 * `middleware.ts` is live by definition; Next never pre-renders it.
 */
const protectedRoutes = ['/profile', '/change-password', '/logout']
const sessionCookie = 'ppga_session'

export default function middleware(req: NextRequest) {
  const pathname = new URL(req.url).pathname
  const hasSession = Boolean(req.cookies.get(sessionCookie)?.value)

  if (!hasSession && protectedRoutes.some((route) => pathname.startsWith(route))) {
    return NextResponse.redirect(new URL('/login', req.url))
  }

  return undefined // pass-through: the request reaches the app unchanged
}
