import 'server-only'

import { getLocale, getTranslations } from 'next-intl/server'

import { headers } from 'next/headers'

import { type ReactNode } from 'react'

import { readOwnProfile } from '../../lib/sup/profile'

import { hasCourseContext, isStandaloneScreen, localePathSuffix } from '../../lib/shellFrame'

import { Shell } from '../../components/Shell'

/**
 * Ticket #41 stage 1: the locale layout — the ONE reusable App Shell frame
 * the issue's Implementation Decision names ("build the Shell once; carry it
 * on the locale layout; it wraps every authenticated surface"). It wraps
 * EVERY authenticated surface under `[locale]`: Dashboard, Course, Module,
 * Lesson, Self-Check, Mission, Practical, Review, Badges, Leaderboard,
 * Profile, Pre-Test, Post-Test, Survey, Change-Password, Health, Teacher
 * queue, Admin users/audit/provisioning/publication/export — never
 * re-implemented per page (stage 1 verbatim).
 *
 * The role comes from `readOwnProfile` (Ticket #3's RLS-gated profile read:
 * the request's session JWT carries the anon-key authority + the
 * `ppg_profiles_select` policy decides whether the row exists — never the
 * service-role key). The Shell's role→nav-items mapping is therefore
 * server-derived from the authenticated session/profile (the issue's
 * Decision); the hide is a UX affordance, never the security mechanism —
 * RLS + the RPC gates stay authoritative at the row level, unchanged.
 *
 * The pathname a server component cannot read itself (the framework's
 * documented boundary: `next/navigation`'s `usePathname` is a Client
 * Component hook and `next/headers` exposes no URL — a nested subtree layout
 * cannot drop the parent frame either). The guard's own `middleware.ts` — the
 * file that already reads the pathname for its session/consent/force-change
 * redirects — rides it to the render on the `x-ppga-path` request header.
 * Login/logout ride STANDALONE (outside the Shell frame: the issue's 8-bit
 * title/start screens — identity + `shell.start` + the page's own form, never
 * the HUD bar / nav / footer); every other pathname under the locale rides
 * the frame.
 *
 * The contextual title is `where appropriate`: on a Course/Module pathname it
 * rides the existing `course.title` copy (PowerPoint Presentation Creation);
 * anywhere else the layout returns `null` and the Shell renders just the
 * product identity (story #6; the stage 4 course-map restyling is the map's
 * own presentation, not the title).
 *
 * `force-dynamic` because the Shell reads the session profile + the XP ledger
 * server-side — `next build` must never pre-render someone else's role, HUD,
 * or consent state (the shipped pages' own pattern).
 */
export const dynamic = 'force-dynamic'

export default async function LocaleLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale()
  const jar = await headers()
  const pathname = jar.get('x-ppga-path') ?? ''

  /** The pathname AFTER the locale prefix (the guard + the routing middleware
   * already resolved the prefix before this render). The root carries a bare
   * `/`; a sub-path carries NO leading slash (`login`, `course`). */
  const suffix = localePathSuffix(pathname, locale)

  /** The three frame questions (suffix / standalone / contextual title) are
   * PURE string logic in `lib/shellFrame` — unit-tested there (a Server
   * Component is not RTL-renderable; the shipped component-test pattern).
   * Login/logout ride STANDALONE outside the Shell frame; the contextual
   * `course.title` rides Course/Module pathnames. */
  const standalone = isStandaloneScreen(suffix)

  /** The contextual Course/Module title where appropriate: the existing
   * `course.title` copy on a Course / any-under-course pathname. */
  const tCourse = await getTranslations('course')
  const contextTitle = hasCourseContext(suffix) ? tCourse('title') : null

  const profile = await readOwnProfile()
  const role = profile.status === 'ok' ? profile.row?.role : undefined

  return <Shell role={role} contextTitle={contextTitle} standalone={standalone}>{children}</Shell>
}
