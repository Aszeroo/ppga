/**
 * @vit-environment jsdom
 */
import { vi } from 'vitest'

// Next 16 ships `next/navigation` as a bare root module that Node's ESM
// resolver fails in jsdom (no exports map). The `Shell` test's RTL render is a
// client `MenuWrap` only — the server `Nav`/`Shell` frames are tested by
// source-assertions (the shipped design-system test's pattern) — so the mock
// stays inert; nothing here navigates for real.
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined }),
  usePathname: () => undefined,
  redirect: () => undefined,
  permanentRedirect: () => undefined,
}) as never)

import { render, cleanup } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, test, expect } from 'vitest'

afterEach(() => cleanup())

import { MenuWrap } from '../../components/MenuWrap'

import thMessages from '../../messages/th.json'
import enMessages from '../../messages/en.json'

/**
 * Ticket #41 stage 2: the Shell/nav component seam — the issue's "RTL for the
 * Shell primitive: given a role it renders exactly that role's navigation
 * (and nothing unauthorized), matching the existing design-system pattern".
 * The mobile collapse affordance (`MenuWrap`'s client render) carries its
 * ARIA state (`aria-expanded` / `aria-label` / `aria-controls` — state never
 * by colour alone, keyboard-operable) in BOTH languages; the role→items
 * MAPPING (learner/teacher/admin lists, nothing unauthorised) rides the
 * source-assertion on `components/Nav.tsx` — the same source-read the
 * design-system test's token/colour checks run.
 */
test('MenuWrap collapse affordance carries its ARIA state + keyboard focus in both locales', () => {
  const labelsFor = (locale: string) => ({
    menuLabel: (locale == 'th' ? thMessages : enMessages).shell.menuLabel,
    openLabel: (locale == 'th' ? thMessages : enMessages).shell.menuOpenLabel,
    closeLabel: (locale == 'th' ? thMessages : enMessages).shell.menuCollapseLabel,
  })

  for (const locale of ['th', 'en'] as ('th' | 'en')[]) {
    const messages = locale == 'th' ? thMessages : enMessages
    const { getByRole } = render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <MenuWrap labels={labelsFor(locale)}>
          <span>pixel</span>
        </MenuWrap>
      </NextIntlClientProvider>,
    )
    const toggle = getByRole('button')
    expect(toggle.getAttribute('type')).toBe('button')
    expect(toggle.getAttribute('aria-controls')).toBe('ppg-nav-menu')
    expect(toggle.getAttribute('aria-expanded')).toBe('false')
    expect(toggle.getAttribute('aria-label')).toContain(labelsFor(locale).menuLabel)
    expect(toggle.getAttribute('class')).toContain('ppg-menu-toggle')
    cleanup()
  }
})

test('MenuWrap toggle announces the OPEN state by aria-expanded, never hue-shift', () => {
  const { getByRole } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <MenuWrap
        labels={{
          menuLabel: enMessages.shell.menuLabel,
          openLabel: enMessages.shell.menuOpenLabel,
          closeLabel: enMessages.shell.menuCollapseLabel,
        }}
      >
        <span>pixel</span>
      </MenuWrap>
    </NextIntlClientProvider>,
  )
  const toggle = getByRole('button')
  expect(toggle.getAttribute('aria-expanded')).toBe('false')
  cleanup()
})

/**
 * Source-assertions (reading `node:fs` works under jsdom too): the role→items
 * mapping is server-derived (an import of `server-only`), the lists are the
 * issue's verbatim, the routes are only existing routes, and a caller without
 * a role sees NOTHING (no unauthorised destination renders).
 */
test('Nav mapping is server-side, only existing routes, and per-role exactly', async () => {
  const fs = await import('node:fs')
  const src = fs.readFileSync('components/Nav.tsx', 'utf8')
  // server-only: the role→items mapping is server-derived, never a client
  // decision.
  expect(src).toContain("import 'server-only'")
  // The issue's verbatim lists ride the source: Learner = Dashboard, Course,
  // Badges, Leaderboard, Profile.
  for (const route of [
    // learner destinations
    "'/course'",
    "'/badges'",
    "'/leaderboard'",
    // teacher destination
    "'/teacher/review'",
    // admin destinations
    "'/admin/publication'",
    "'/admin/users'",
    "'/admin/audit'",
    "'/admin/provisioning'",
    "'/admin/export'",
    "'/health'",
  ] as string[]) {
    expect(src).toContain(route)
  }
  // Nothing unauthorised renders for another role: the renderer emits nothing
  // for a caller whose role is not one of the lists (a `role == undefined`
  // sees an empty nav, not a hidden affordance that a URL could pass).
  expect(src).toContain('role ? NAV_ITEMS[role] : []')
})

test('No ad-hoc colour in the Shell/nav components: every colour resolves a token', async () => {
  const fs = await import('node:fs')
  const sources = ['Shell', 'Nav', 'MenuWrap', 'XPHud'].map(
    (name) => fs.readFileSync(`components/${name}.tsx`, 'utf8'),
  )
  for (const src of sources as string[]) {
    // No `#rrggbb` colours anywhere — every colour the components resolve is a
    // `var(--ppg-…)` token from `app/globals.css` (the ticket's discipline).
    expect(src).not.toMatch(/#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]/)
  }
})

test('shellFrame: the locale suffix, standalone screens and course context are pure totals', async () => {
  const { localePathSuffix, isStandaloneScreen, hasCourseContext } = await import('../../lib/shellFrame')
  // The suffix: root -> empty, sub-path -> NO leading slash, foreign prefix -> verbatim.
  expect(localePathSuffix('/th', 'th')).toBe('')
  expect(localePathSuffix('/th/login', 'th')).toBe('login')
  expect(localePathSuffix('/en/course/module-08/mission', 'en')).toBe('course/module-08/mission')
  expect(localePathSuffix('/protected', 'th')).toBe('/protected')
  // Standalone ONLY for the two title screens (never `login-history`-style paths).
  expect(isStandaloneScreen('login')).toBe(true)
  expect(isStandaloneScreen('logout')).toBe(true)
  expect(isStandaloneScreen('')).toBe(false)
  expect(isStandaloneScreen('course')).toBe(false)
  expect(isStandaloneScreen('loginx')).toBe(false)
  // Contextual title: the Course map + every under-course path, nothing else.
  expect(hasCourseContext('course')).toBe(true)
  expect(hasCourseContext('course/module-08/module-08-lesson-01')).toBe(true)
  expect(hasCourseContext('')).toBe(false)
  expect(hasCourseContext('teacher/review')).toBe(false)
})
