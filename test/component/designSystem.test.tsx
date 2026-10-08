/**
 * @vit-environment jsdom
 */
import { vi } from 'vitest'

// The gallery / primitives are Client Components that read `useTranslations`
// on the jsdom path. `next-intl` is inlined by `vitest.config.mts` (the
// `deps.inline` list) so its bare imports (`next/navigation`) ride the Vite
// alias for the navigation module; the design-system tests never navigate for
// real, so the navigation fns are inert stubs.
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

import { Badge } from '../../components/Badge'
import { BadgeCard } from '../../components/BadgeCard'
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { LockedState, AvailableState } from '../../components/State'
import { ProgressBar } from '../../components/ProgressBar'
import { StageMap } from '../../components/StageMap'
import { StatusPill } from '../../components/StatusPill'
import { XPBar } from '../../components/XPBar'

import thMessages from '../../messages/th.json'
import enMessages from '../../messages/en.json'

/**
 * Ticket #5 design-system primitives (CI runs them in jsdom): every primitive
 * is a real accessible control (a `button`/`progressbar`/`status` role, a real
 * `aria-label`, a keyboard `tabIndex`) whose *state* is announced by text +
 * `aria-disabled` / `aria-valuetext` + the stripe/`data-*` marker — never by
 * the colour alone. The tokens ride `app/globals.css` (no ad-hoc colours in
 * any component) and the `--ppg-*` custom properties are the single palette.
 */
test('Button is a real accessible button whose state is never colour-alone', () => {
  const messagesFor = (locale: string) =>
    locale === 'th' ? thMessages : enMessages
  const lockedLabel = (locale: string) =>
    `${messagesFor(locale).gallery.states.locked} — lesson`

  for (const locale of ['th', 'en'] as 'th' | 'en'[]) {
    const { getByRole } = render(
      <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
        <Button label="lesson" status="locked" />
      </NextIntlClientProvider>,
    )
    const button = getByRole('button')
    expect(button.getAttribute('type')).toBe('button')
    expect((button as HTMLButtonElement).disabled).toBeTruthy()
    expect(button.getAttribute('data-ppg-state')).toBe('locked')
    // The “Locked” text rides the `aria-label`: a screen-reader speaks the
    // state, not a colour only.
    expect(button.getAttribute('aria-label')).toContain(lockedLabel(locale))
    cleanup()
  }
})

test('Badge is a focusable accessible label whose tone maps to the token', () => {
  const { getByRole } = render(
    <NextIntlClientProvider locale="th" messages={thMessages}>
      <Badge text="slide" tone="success" />
    </NextIntlClientProvider>,
  )
  // A focusable `span` gets the `generic` role in jsdom; the `data-*` marker
  // + the `aria-label` name it.
  const badge = getByRole('generic', { name: /— slide/ })
  expect(badge.getAttribute('data-ppg-tone')).toBe('success')
  expect(badge.getAttribute('aria-label')).toContain(
    `${thMessages.gallery.tones.success} — slide`,
  )
  expect(badge.getAttribute('class')).toContain('ppg-badge')
  cleanup()
})

test('StatusPill is a live-status region whose state rides the aria-label text', () => {
  const { getByRole } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <StatusPill label="lesson" tone="locked" />
    </NextIntlClientProvider>,
  )
  const pill = getByRole('status')
  expect(pill.getAttribute('data-ppg-tone')).toBe('locked')
  expect(pill.getAttribute('aria-label')).toContain(
    `${enMessages.gallery.tones.locked} — lesson`,
  )
  cleanup()
})

test('ProgressBar is a real progressbar whose number is the aria value', () => {
  const { getByRole } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ProgressBar value={68} />
    </NextIntlClientProvider>,
  )
  const bar = getByRole('progressbar')
  expect(bar.getAttribute('aria-valuenow')).toBe('68')
  expect(bar.getAttribute('aria-valuemin')).toBe('0')
  expect(bar.getAttribute('aria-valuemax')).toBe('100')
  expect(bar.getAttribute('aria-valuetext')).toContain(
    `${enMessages.gallery.progress.value} 68/100`,
  )
  cleanup()
})

test('XPBar is a real progressbar whose XP numeral rides the swap-pointed family', () => {
  const { getByRole } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <XPBar xp={138} />
    </NextIntlClientProvider>,
  )
  const bar = getByRole('progressbar')
  expect(bar.getAttribute('aria-valuenow')).toBe('138')
  // The `.ppg-xp-numeral` span rides the single-token swap point stack.
  const numeral = bar.querySelector('.ppg-xp-numeral')
  expect(numeral?.getAttribute('class')).toContain('ppg-xp-numeral')
  cleanup()
})

test('Card is focusable and names its heading in the aria-label', () => {
  const { getByRole } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Card heading="Pastel card" body="A slide lives on this surface." />
    </NextIntlClientProvider>,
  )
  // A focusable `section` is a `region` role in jsdom.
  const card = getByRole('region')
  expect(card.getAttribute('aria-label')).toContain(
    `${enMessages.gallery.states.available} — Pastel card`,
  )
  expect(card.getAttribute('tabIndex')).toBe('0')
  cleanup()
})

test('BadgeCard is a focusable earned/locked badge card whose state rides the data-ppg-state + the aria-label text', () => {
  const { getByRole } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <BadgeCard heading="First Steps" body="Criteria shown" status="locked" icon="⭐" />
    </NextIntlClientProvider>,
  )
  // A focusable `section` is a `region` role in jsdom; the `.ppg-badge-card`
  // class + the `data-ppg-state` are the card's own state marker, and the
  // locked card's `aria-label` carries the “Locked” text (never the hue
  // alone). The icon circle is `aria-hidden` decoration only.
  const card = getByRole('region')
  expect(card.getAttribute('class')).toContain('ppg-badge-card')
  expect(card.getAttribute('data-ppg-state')).toBe('locked')
  expect(card.getAttribute('aria-label')).toContain(
    `${enMessages.gallery.states.locked} — First Steps`,
  )
  expect(card.getAttribute('tabIndex')).toBe('0')
  const icon = card.querySelector('.ppg-badge-icon')
  expect(icon?.getAttribute('aria-hidden')).toBe('true')
  cleanup()

  const { getByRole: getRegion2 } = render(
    <NextIntlClientProvider locale="th" messages={thMessages}>
      <BadgeCard heading="ก้าวแรก" body="Criteria shown" status="available" icon="⭐" />
    </NextIntlClientProvider>,
  )
  const earned = getRegion2('region')
  expect(earned.getAttribute('data-ppg-state')).toBe('available')
  expect(earned.getAttribute('aria-label')).toContain(
    `${thMessages.gallery.states.available} — ก้าวแรก`,
  )
  cleanup()
})

test('LockedState announces the locked state by text + aria-disabled, never hue-shift', () => {
  const { getByRole } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <LockedState label="lesson">
        <span>pixel</span>
      </LockedState>
    </NextIntlClientProvider>,
  )
  const locked = getByRole('generic', { name: /— lesson/ })
  expect(locked.getAttribute('aria-disabled')).toBe('true')
  expect(locked.getAttribute('data-ppg-state')).toBe('locked')
  expect(locked.getAttribute('aria-label')).toContain(
    `${enMessages.gallery.states.locked} — lesson`,
  )
  cleanup()
})

test('AvailableState is focusable and names the available state by text', () => {
  const { getByRole } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <AvailableState label="lesson">
        <span>pixel</span>
      </AvailableState>
    </NextIntlClientProvider>,
  )
  const available = getByRole('generic', { name: /— lesson/ })
  expect(available.getAttribute('aria-label')).toContain(
    `${enMessages.gallery.states.available} — lesson`,
  )
  expect(available.getAttribute('data-ppg-state')).toBe('available')
  expect(available.getAttribute('tabIndex')).toBe('0')
  cleanup()
})

/**
 * Source-assertions (reading `node:fs` works under jsdom too): the tokens are
 * defined once, the palette is not ad-hoc, and the single-token swap point for
 * the V3 type pair exists as two CSS variables.
 */
test('Tokens live once in app/globals.css and the V3 font swap points are two variables', async () => {
  const fs = await import('node:fs')
  const css = fs.readFileSync('app/globals.css', 'utf8')
  const layout = fs.readFileSync('app/layout.tsx', 'utf8')
  // The palette tokens — every colour a component resolves is a `--ppg-*`.
  for (const token of [
    '--ppg-pink-100',
    '--ppg-blue-500',
    '--ppg-space-3',
    '--ppg-border-1',
    '--ppg-shadow-pixel-1',
    '--ppg-focus-ring',
    '--ppg-status-success',
    '--ppg-status-warning',
    '--ppg-status-error',
    '--ppg-status-locked',
  ] as string[]) {
    expect(css).toContain(token)
  }
  // The single-token swap point: the V3 type pair is declared once by
  // `next/font/google` in `app/layout.tsx` (the `variable:` names) and every
  // heading / button / badge / XP-numeral role resolves the pair only — a
  // swap in one place re-tunes the whole app's type. Ticket #50 / ADR-0004:
  // the display role is Press Start 2P (`--font-ppg-display`, ASCII-only),
  // the body role Noto Sans Thai (`--font-ppg-body`).
  expect(layout).toContain("variable: '--font-ppg-display'")
  expect(layout).toContain("variable: '--font-ppg-body'")
  expect(css).toContain('var(--font-ppg-display)')
  expect(css).toContain('var(--font-ppg-body)')
  // Reduced-motion is respected in the token module.
  expect(css).toContain('prefers-reduced-motion')
  // PPGA #46: the XP/progress FILLS carry their stepped transition as an
  // INLINE style (components' convention) — a stylesheet rule can only
  // outrank inline with `!important`, and it must target the FILL classes
  // (the parent bar's class alone never overrode the child's inline rule).
  expect(css).toMatch(/\.ppg-xp-fill,[^}]*transition-duration: 0s !important/)
})

test('No ad-hoc colour anywhere: every component colour resolves a token', async () => {
  const fs = await import('node:fs')
  const sources = ['Button', 'Card', 'Badge', 'StatusPill', 'ProgressBar', 'XPBar', 'State', 'StageNode', 'StageMap', 'ChallengeTrack', 'MissionPanel', 'SelfCheckPanel', 'UploadArea', 'RewardCelebration', 'XpRewardChip', 'TokenSheet'].map(
    (name) => fs.readFileSync(`components/${name}.tsx`, 'utf8'),
  )
  for (const src of sources as string[]) {
    // No `#rrggbb` colours anywhere in the components' source — every colour
    // resolves a `var(--ppg-…)` token from `app/globals.css`.
    expect(src).not.toMatch(/#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]/)
  }
})

test('StageMap renders the ordered stage road: cleared marks, the current node, a semantically locked no-link stage', () => {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <StageMap
        mapLabel="Course map"
        stages={[
          {
            moduleKey: 'module-01',
            orderIndex: 1,
            title: 'Opening PowerPoint',
            summary: 'The first stage.',
            state: 'cleared',
            stateCopy: 'cleared-copy',
            href: '/course',
          },
          {
            moduleKey: 'module-02',
            orderIndex: 2,
            title: 'Slides & layouts',
            summary: 'The frontier stage.',
            state: 'open',
            stateCopy: 'open-copy',
            isNext: true,
            nextCopy: 'next-stage-copy',
            href: '/course',
          },
          {
            moduleKey: 'module-03',
            orderIndex: 3,
            title: 'Text & fonts',
            summary: 'Not yet reachable.',
            state: 'locked',
            stateCopy: 'locked-copy',
          },
        ]}
      />
    </NextIntlClientProvider>,
  )

  const list = container.querySelector('ol.ppg-stage-map')
  expect(list?.getAttribute('aria-label')).toBe('Course map')
  const items = Array.from(container.querySelectorAll('.ppg-stage-item'))
  expect(items).toHaveLength(3)
  // The ORDER is the map's semantics: the DATABASE's `order_index`.
  expect(
    items.map((li) => li.querySelector('[data-ppg-stage-state]')?.getAttribute('data-ppg-stage-module')),
  ).toEqual(['module-01', 'module-02', 'module-03'])

  // Cleared: the real state copy + the clear mark + a keyboard link.
  const cleared = items[0].querySelector('.ppg-stage-node') as HTMLElement
  expect(cleared.getAttribute('data-ppg-stage-state')).toBe('cleared')
  expect(cleared.querySelector('.ppg-stage-clear-mark')).toBeTruthy()
  expect(cleared.getAttribute('aria-label')).toContain('cleared-copy')

  // The frontier: the `data-ppg-stage-current` marker + the next chip copy.
  const frontier = items[1].querySelector('.ppg-stage-node') as HTMLElement
  expect(frontier.getAttribute('data-ppg-stage-current')).toBe('true')
  expect(frontier.textContent).toContain('next-stage-copy')
  expect(frontier.querySelector('a.ppg-stage-link')).toBeTruthy()

  // Locked: visible AND semantic — copy + stripes + aria-disabled, and NO
  // link anywhere in the node (never hidden, never fake-unlocked).
  const locked = items[2].querySelector('.ppg-stage-node') as HTMLElement
  expect(locked.getAttribute('aria-disabled')).toBe('true')
  expect(locked.className).toContain('ppg-state-locked')
  expect(locked.getAttribute('aria-label')).toContain('locked-copy')
  expect(locked.querySelector('a')).toBeNull()
  // The connectors join the road (the first node has none).
  expect(items[0].querySelector('.ppg-stage-connector')).toBeNull()
  expect(items[2].querySelector('.ppg-stage-connector')).toBeTruthy()

  // PPGA #52: the V3 stage vocabulary — the gold MODULE numeral tile on
  // every node, and the state chip's aria-hidden icon beside the copy
  // (done/current/locked read as icon + TEXT, never hue only).
  for (const li of items) {
    expect(li.querySelector('.ppg-stage-node .ppg-stage-numeral')).toBeTruthy()
  }
  const lockedChip = locked.querySelector('.ppg-stage-state-chip') as HTMLElement
  expect(lockedChip.textContent).toContain('locked-copy')
  expect(lockedChip.querySelector('[aria-hidden="true"]')?.textContent).toContain('🔒')
  const clearedChip = items[0].querySelector('.ppg-stage-state-chip') as HTMLElement
  expect(clearedChip.querySelector('[aria-hidden="true"]')?.textContent).toContain('✓')
})
