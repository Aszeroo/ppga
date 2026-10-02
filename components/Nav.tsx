import 'server-only'

import { getTranslations } from 'next-intl/server'

import { type CSSProperties } from 'react'

import { Link } from '../lib/i18n/routing'

import { MenuWrap } from './MenuWrap'

/**
 * Ticket #41 stage 2: the role→nav-items mapping — server-derived from the
 * authenticated session/profile (the issue: "the role→nav-items mapping is
 * server-side from the authenticated session/profile"). The issue's lists are
 * implemented verbatim and ONLY the existing routes:
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
 * The labels come from the existing `nav.*` keys + the six keys this stage
 * adds (`course`, `badges`, `leaderboard`, `reviewQueue`,
 * `coursePublication`, `adminExport`) — complete in Thai and English, no raw
 * keys anywhere (`story #31`). The mobile collapse rides `MenuWrap` (the
 * accessible `aria-expanded` toggle; `story #8`/`#10`) — no sidebar.
 */
export interface NavProps {
  role?: 'learner' | 'teacher' | 'admin'
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

export async function Nav({ role }: NavProps) {
  const t = await getTranslations('shell')
  const navT = await getTranslations('nav')

  const items = role ? NAV_ITEMS[role] : []

  const itemStyle: CSSProperties = {
    fontFamily: 'var(--font-ta16bit), var(--font-mitr)',
    color: 'var(--ppg-fg-heading)',
    padding: 'var(--ppg-space-2) var(--ppg-space-3)',
    borderWidth: 'var(--ppg-border-2)',
    borderColor: 'var(--ppg-blue-300)',
    borderStyle: 'solid',
    boxShadow: 'var(--ppg-shadow-pixel-1)',
    backgroundColor: 'var(--ppg-state-available-bg)',
  }

  return (
    <nav
      className="ppg-nav"
      id="ppg-nav-menu"
      aria-label={t('navLabel')}
      style={{
        fontFamily: 'var(--font-ta16bit), var(--font-mitr)',
      }}
    >
      <MenuWrap
        labels={{
          menuLabel: t('menuLabel'),
          openLabel: t('menuOpenLabel'),
          closeLabel: t('menuCollapseLabel'),
        }}
      >
        {items.map((item) => (
          // The issue's "only existing routes" — every destination below is a
          // `routing.ts` pathname (the `pathnames` map carries them verbatim);
          // the cast is the locale-aware `Link`'s pathname type, never an
          // invented route (the guard + the RLS would deny any off-list link
          // server-side, unchanged).
          <Link key={item.key} className="ppg-nav-item" href={item.href as never} style={itemStyle}>
            {navT(item.key)}
          </Link>
        ))}
      </MenuWrap>
    </nav>
  )
}
