import 'server-only'

import { getTranslations } from 'next-intl/server'

import { Link } from '../lib/i18n/routing'

import { MenuWrap } from './MenuWrap'

/**
 * Ticket #51: the V3 nav pills — the role→nav-items mapping is UNCHANGED,
 * server-derived from the authenticated session/profile (the issue:
 * "the role→nav-items mapping is server-side from the authenticated
 * session/profile"). The issue's lists are implemented verbatim and ONLY the
 * existing routes:
 *
 * - Learner: Dashboard (`/`, `nav.home`), Course (`/course`, `nav.course`),
 *   Badges (`/badges`, `nav.badges`), Leaderboard (`/leaderboard`,
 *   `nav.leaderboard`), Profile (`/profile`, `nav.profile`).
 * - Teacher: Dashboard, Review Queue (`/teacher/review`,
 *   `nav.reviewQueue`), Profile.
 * - Admin: Dashboard, Course / Publication (`/admin/publication`,
 *   `nav.coursePublication`), User list (`/admin/users`, `nav.adminUsers`),
 *   Audit stream (`/admin/audit`, `nav.adminAudit`), Provision roster
 *   (`/admin/provisioning`, `nav.adminProvisioning`), Export (`/admin/export`,
 *   `nav.adminExport`), Health (`/health`, `nav.health`), Profile.
 *
 * Unauthorized destinations NEVER render for another role (`story #11`): the
 * renderer emits nothing for a missing role (`role == undefined` -> empty) —
 * the hide is a UX affordance, never the security mechanism (RLS + the RPC
 * gates stay authoritative at the row level; an other role's direct visit
 * hits its own denied state server-side, unchanged).
 *
 * Ticket #51 adds ONLY the visual current-page state — the gallery's
 * `.nl.on` active-section pill: the item whose route owns the current
 * pathname suffix rides `.ppg-nav-current` (gradient + blue border) AND
 * `aria-current="page"` (state never by colour alone). The suffix is the
 * locale layout's `x-ppga-path` read — presentation, never a decision.
 *
 * The labels come from the existing `nav.*` keys; complete in Thai and
 * English, no raw keys anywhere (`story #31`). The mobile collapse rides
 * `MenuWrap` (the accessible `aria-expanded` toggle; `story #8`/`#10`) — no
 * sidebar; below the V3 tablet breakpoint (<1000px) the links hide behind the
 * toggle while the HUD cluster stays visible.
 */
export interface NavProps {
  role?: 'learner' | 'teacher' | 'admin'
  /** The pathname AFTER the locale prefix (`''` = Dashboard, `course`,
   * `course/module-01`, …) — decides the ACTIVE pill. */
  activeSection?: string
}

interface NavItem {
  href: string
  key: string
}

const NAV_ITEMS = {
  learner: [
    { href: '/', key: 'home' },
    { href: '/course', key: 'course' },
    { href: '/badges', key: 'badges' },
    { href: '/leaderboard', key: 'leaderboard' },
    { href: '/profile', key: 'profile' },
  ] as NavItem[],
  teacher: [
    { href: '/', key: 'home' },
    { href: '/teacher/review', key: 'reviewQueue' },
    { href: '/profile', key: 'profile' },
  ] as NavItem[],
  admin: [
    { href: '/', key: 'home' },
    { href: '/admin/publication', key: 'coursePublication' },
    { href: '/admin/users', key: 'adminUsers' },
    { href: '/admin/audit', key: 'adminAudit' },
    { href: '/admin/provisioning', key: 'adminProvisioning' },
    { href: '/admin/export', key: 'adminExport' },
    { href: '/health', key: 'health' },
    { href: '/profile', key: 'profile' },
  ] as NavItem[],
}

/** The section a nav item owns: `/` owns the locale root (`''`); every other
 * item owns its own path + every path UNDER it (`/course` owns
 * `course/module-01/...`). A string comparison only — the routes themselves
 * are guarded server-side by the RLS/redirects, unchanged. */
function ownsPath(href: string, activeSection: string | undefined): boolean {
  if (activeSection === undefined) return false
  const section = href === '/' ? '' : href.slice(1)
  return activeSection === section || (section !== '' && activeSection.startsWith(`${section}/`))
}

export async function Nav({ role, activeSection }: NavProps) {
  const t = await getTranslations('shell')
  const navT = await getTranslations('nav')

  const items = role ? NAV_ITEMS[role] : []

  return (
    <nav className="ppg-nav" id="ppg-nav-menu" aria-label={t('navLabel')}>
      <MenuWrap
        labels={{
          menuLabel: t('menuLabel'),
          openLabel: t('menuOpenLabel'),
          closeLabel: t('menuCollapseLabel'),
        }}
      >
        {items.map((item) => {
          const current = ownsPath(item.href, activeSection)
          return (
            // The issue's "only existing routes" — every destination below is a
            // `routing.ts` pathname (the `pathnames` map carries them verbatim);
            // the cast is the locale-aware `Link`'s pathname type, never an
            // invented route (the guard + the RLS would deny any off-list link
            // server-side, unchanged).
            <Link
              key={item.key}
              className={`ppg-nav-item ppg-nav-pill${current ? ' ppg-nav-current' : ''}`}
              aria-current={current ? 'page' : undefined}
              href={item.href as never}
            >
              {navT(item.key)}
            </Link>
          )
        })}
      </MenuWrap>
    </nav>
  )
}
