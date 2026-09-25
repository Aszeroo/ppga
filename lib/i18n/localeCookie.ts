/**
 * Ticket #4 locale cookie: `ppa-locale`? — no, `ppga-locale` — the name the
 * routing middleware writes on every locale switch so the learner's choice
 * survives navigation and refresh; its one-year `maxAge` outlasts the 7-day
 * session cookie, so the choice also survives a logout and a re-login.
 *
 * A small pure module so the unit test (`test/unit/localePersistence.test.ts`)
 * asserts the name and the lifetime without importing routing.ts's
 * next-intl navigation wrappers (which ESM-import `next/navigation` outside
 * Next's bundler and fail in jsdom).
 */
export const localeCookie = {
  name: 'ppga-locale',
  maxAge: 60 * 60 * 24 * 365,
}
