import { createNavigation } from 'next-intl/navigation'
import { defineRouting } from 'next-intl/routing'

import { localeCookie } from './localeCookie'
import { locales, type Locale } from './locales'

/**
 * Ticket #4 routing: the platform is Thai-first, English is the alternative.
 * `localePrefix: {mode: 'always'}` so every route is addressable under its
 * language prefix — `/th` is the default landing, `/en` the explicit English
 * switch, which must work everywhere (the selector's `setPath` overrides the
 * locale on any pathname).
 *
 * The locale cookie is ours (see localeCookie.ts: name `ppga-locale` so it is
 * grep-able and survives a session logout) with a one-year `maxAge` so the
 * choice outlasts navigation, refresh, logout, and re-login.
 */
export const routing = defineRouting({
  locales,
  defaultLocale: 'th' as Locale,
  localePrefix: { mode: 'always' },
  localeCookie,
  pathnames: {
    '/': '/',
    '/login': '/login',
    '/logout': '/logout',
    '/change-password': '/change-password',
    '/profile': '/profile',
    '/health': '/health',
    '/admin/users': '/admin/users',
    '/admin/audit': '/admin/audit',
  },
})

export const { Link, usePathname, useRouter } = createNavigation(routing)

/** Consumers of this module need the names too; re-export them. */
export { locales }
export type { Locale }
