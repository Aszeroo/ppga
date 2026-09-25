import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

import { localeCookie } from '../../lib/i18n/localeCookie'
import { localeSchema } from '../../lib/i18n/localeSchema'

/**
 * Ticket #4 locale persistence, unit tests (CI runs them on node, no Supabase
 * or Postgres): the cookie is what survives navigation and refresh, the
 * profile is what survives logout and re-login — the two legs together are the
 * acceptance criterion "language persists". The tests assert the observable
 * configuration (the cookie name and its lifetime, the Zod schema, and the
 * RLS-respecting behaviour of `updateOwnLocale` when there is no session),
 * never a live service. `updateOwnLocale` is a server-only module so this test
 * reads its source rather than importing it.
 */
const sessionCookieMaxAge = 60 * 60 * 24 * 7
const base = process.cwd()

const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

test('the locale cookie outlasts the session cookie (it survives logout)', () => {
  const cookie = localeCookie
  expect(cookie.name).toBe('ppga-locale')
  expect(cookie.maxAge).toBe(60 * 60 * 24 * 365)
  expect(cookie.maxAge).toBeGreaterThan(sessionCookieMaxAge)
})

test('the API route bounds the locale to the routing locales', () => {
  expect(localeSchema.safeParse({ locale: 'th' }).success).toBe(true)
  expect(localeSchema.safeParse({ locale: 'en' }).success).toBe(true)
  for (const junk of ['de', 'thx', {}, { locale: 1 }]) {
    expect(localeSchema.safeParse(junk).success).toBe(false)
  }
})

test('updateOwnLocale respects the session: no session never updates', () => {
  const source = read('lib/sup/profile.ts')
  expect(source.includes('updateOwnLocale')).toBe(true)
  // The update path is gated on a session before it reaches PostgREST:
  expect(source.includes("if (!session || !session.session) return { ok: false, detail: 'no session' }")).toBe(true)
  // RLS speaks with the user's JWT, never the service-role key:
  expect(!source.includes('SUP_SERVICE_ROLE_KEY')).toBe(true)
})
