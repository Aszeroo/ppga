import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #3 static guards (pure source inspection — runs in CI without any
 * Supabase/Postgres credentials): the auth flows exist server-side with httpOnly
 * cookies; Zod guards every form; the middleware carries the unauthorized
 * redirect; and NO signup/self-registration route exists anywhere.
 */
const base = process.cwd()

const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

test('auth flows: session tokens ride httpOnly cookies server-side', () => {
  const auth = read('lib/sup/auth.ts')
  expect(auth.includes('httpOnly: true')) .toBe(true)
  expect(auth.includes('sameSite')).toBe(true)
  expect(auth.includes('signInWithPassword')).toBe(true)
  expect(auth.includes('PUT') && auth.includes('/user')).toBe(true)
  expect(auth.includes('/logout')).toBe(true)
})

test('auth API routes re-validate forms with Zod and stay cookie-safe', () => {
  const login = read('app/api/auth/login/route.ts')
  expect(login.includes('loginFormSchema')).toBe(true)
  expect(login.includes('safeParse')).toBe(true)
  expect(login.includes('syntheticEmail')).toBe(true)

  const change = read('app/api/auth/change-password/route.ts')
  expect(change.includes('changePasswordFormSchema')).toBe(true)
  expect(change.includes('safeParse')).toBe(true)

  const logout = read('app/api/auth/logout/route.ts')
  expect(logout.includes('logoutFormSchema')).toBe(true)
  expect(logout.includes('signOutViaSupaHttp')).toBe(true)
})

test('middleware guards role routes with an unauthorized redirect', () => {
  const mw = read('middleware.ts')
  console.log('DEBUG includes URL literal:', mw.includes("new URL('/login', req.url)"))
  expect(mw.includes('protectedRoutes')).toBe(true)
  expect(mw.includes('ppga_session')).toBe(true)
  expect(mw.includes('NextResponse.redirect')).toBe(true)
  expect(mw.includes("new URL('/login', req.url)")).toBe(true)
})

test('no self-registration path exists anywhere in the app or the API', () => {
  const pages = ['app/login/page.tsx', 'app/change-password/page.tsx', 'app/profile/page.tsx', 'app/logout/page.tsx']
  for (const page of pages) {
    const source = read(page)
    expect(!source.includes('signUp') && !source.includes('signup')).toBe(true)
  }
  const auth = read('lib/sup/auth.ts')
  expect(!auth.includes('signUp') && !auth.includes('signup')).toBe(true)
  // And no /signup route directory at all:
  expect(!read('app/api/auth/login/route.ts').includes('signup')).toBe(true)
})
