/**
 * Ticket #4 locale list: the platform speaks Thai first and English next — the
 * values both the routing locales list and the profile's `locale` column share
 * (migration + routing.ts). It is a small pure module so the component/unit
 * tests import the locale names without pulling next-intl's navigation
 * wrappers (which ESM-import `next/navigation` outside Next's bundler and
 * fail in jsdom).
 */
export const locales = ['th', 'en'] as const
export type Locale = 'th' | 'en'
