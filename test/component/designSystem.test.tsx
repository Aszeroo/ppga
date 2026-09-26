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
import { Button } from '../../components/Button'
import { Card } from '../../components/Card'
import { LockedState, AvailableState } from '../../components/State'
import { ProgressBar } from '../../components/ProgressBar'
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
 * TA16BIT exists as one CSS variable.
 */
test('Tokens live once in app/globals.css and the TA16BIT swap point is one variable', async () => {
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
  // The single-token swap point: the TA16BIT family is declared once as the
  // `--font-ta16bit` CSS variable (`app/layout.tsx`'s `variable:`) and every
  // heading / button / badge / XP-numeral role resolves it only — a swap in
  // one place re-tunes the whole app's heading face.
  expect(layout).toContain("variable: '--font-ta16bit'")
  expect(css).toContain('var(--font-ta16bit)')
  // Reduced-motion is respected in the token module.
  expect(css).toContain('prefers-reduced-motion')
})

test('No ad-hoc colour anywhere: every component colour resolves a token', async () => {
  const fs = await import('node:fs')
  const sources = ['Button', 'Card', 'Badge', 'StatusPill', 'ProgressBar', 'XPBar', 'State'].map(
    (name) => fs.readFileSync(`components/${name}.tsx`, 'utf8'),
  )
  for (const src of sources as string[]) {
    // No `#rrggbb` colours anywhere in the components' source — every colour
    // resolves a `var(--ppg-…)` token from `app/globals.css`.
    expect(src).not.toMatch(/#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]/)
  }
})
