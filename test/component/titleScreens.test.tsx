/**
 * @vit-environment jsdom
 */
import { vi } from 'vitest'

// The pages (and the locale `Link` / the selector) import `next/navigation`
// through the routing wrappers — the same bare-import mock the shipped
// selector/shell component tests use (nothing here navigates for real).
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

import LoginPage from '../../app/[locale]/login/page'
import LogoutPage from '../../app/[locale]/logout/page'

import thMessages from '../../messages/th.json'
import enMessages from '../../messages/en.json'

/**
 * PPGA #49 (owner preview review): the login/logout title screens in the V3
 * design's `#s-login` idiom — the standalone CARD the pages render (mascot +
 * the pixel `PPGA` wordmark heading + the design-verbatim copy + the language
 * switch on the card) — while the FORM CONTRACT stays byte-identical to what
 * #3/#41 shipped (the e2e `signIn`/`signOut` helpers select exactly these):
 * the same ids/names/types, the same required/min/max, the same client-side
 * submit (no form action), the same busy/message lines, and NO framed chrome
 * (no header/footer/menu toggle — the owner's screenshot bug).
 */
const messagesFor = (locale: 'th' | 'en') => (locale === 'th' ? thMessages : enMessages)

/** The login's form-contract snapshot (attribute-for-attribute; the same in
 * both locales — only the copy differs). */
function contractOf(locale: 'th' | 'en') {
  const { container } = render(
    <NextIntlClientProvider locale={locale} messages={messagesFor(locale)}>
      <LoginPage />
    </NextIntlClientProvider>,
  )
  const form = container.querySelector('form')!
  const identifier = container.querySelector('#identifier') as HTMLInputElement
  const password = container.querySelector('#password') as HTMLInputElement
  const submit = container.querySelector('button[type=submit]') as HTMLButtonElement
  return {
    formAction: form.getAttribute('action'),
    identifier: {
      name: identifier.getAttribute('name'),
      type: identifier.getAttribute('type'),
      required: identifier.hasAttribute('required'),
      min: identifier.getAttribute('minlength'),
      max: identifier.getAttribute('maxlength'),
    },
    password: {
      name: password.getAttribute('name'),
      type: password.getAttribute('type'),
      required: password.hasAttribute('required'),
      min: password.getAttribute('minlength'),
      max: password.getAttribute('maxlength'),
    },
    submitType: submit.getAttribute('type'),
  }
}

test('login form contract is byte-identical across locales and unchanged: same ids/names/types/min/max, no form action', () => {
  expect(contractOf('th')).toEqual(contractOf('en'))
  expect(contractOf('th')).toEqual({
    formAction: null,
    identifier: { name: 'identifier', type: null, required: true, min: '3', max: '50' },
    password: { name: 'password', type: 'password', required: true, min: '8', max: '72' },
    submitType: 'submit',
  })
})

test('login renders the design card standalone: wordmark heading, welcome, two-line blurb, design labels + placeholders, the switch on the card — and NO framed chrome', () => {
  for (const locale of ['th', 'en'] as ('th' | 'en')[]) {
    const m = messagesFor(locale)
    const { container, getByRole } = render(
      <NextIntlClientProvider locale={locale} messages={m}>
        <LoginPage />
      </NextIntlClientProvider>,
    )
    // The card + its decoration (mascot is aria-hidden, wordmark is THE h1).
    expect(container.querySelector('section.ppg-login-card')).toBeTruthy()
    expect(container.querySelector('.ppg-strip-top')).toBeTruthy()
    const mascot = container.querySelector('.ppg-mascot')!
    expect(mascot.getAttribute('aria-hidden')).toBe('true')
    expect(getByRole('heading', { level: 1, name: m.shell.logo })).toBeTruthy()
    // The design-verbatim copy (`#s-login` bytes, messages-sourced).
    expect(container.textContent).toContain(m.login.welcome)
    expect(container.textContent).toContain(m.login.blurbLine1)
    expect(container.textContent).toContain(m.login.blurbLine2)
    expect(container.querySelector('#identifier')!.getAttribute('placeholder')).toBe(m.login.identifierPlaceholder)
    expect(container.querySelector('#password')!.getAttribute('placeholder')).toBe(m.login.passwordPlaceholder)
    const labels = Array.from(container.querySelectorAll('label'))
    expect(labels.map((l) => l.textContent)).toEqual([m.login.identifier, m.login.password])
    // ONE full-width pink CTA inside the card.
    const submit = getByRole('button', { name: m.login.submit })
    expect(submit.className).toContain('ppg-cta')
    expect(submit.className).toContain('ppg-cta-block')
    // The language switch rides the card (the `.lang-sw` pill row, the real
    // select, `aria-current` on the current option — state never colour-only).
    const nav = getByRole('navigation', { name: m.selector.label })
    expect(nav.getAttribute('class')).toContain('ppg-lang-sw')
    expect(nav.querySelector('#ppga-locale-selector')).toBeTruthy()
    // NO framed chrome on a title screen — and NO floating menu toggle.
    expect(container.querySelector('header')).toBeFalsy()
    expect(container.querySelector('footer')).toBeFalsy()
    expect(container.querySelector('.ppg-menu-toggle')).toBeFalsy()
    cleanup()
  }
})

test('logout rides the same standalone card idiom with the #3 mechanics intact', () => {
  for (const locale of ['th', 'en'] as ('th' | 'en')[]) {
    const m = messagesFor(locale)
    const { container, getByRole } = render(
      <NextIntlClientProvider locale={locale} messages={m}>
        <LogoutPage />
      </NextIntlClientProvider>,
    )
    expect(container.querySelector('section.ppg-login-card')).toBeTruthy()
    expect(getByRole('heading', { level: 1, name: m.shell.logo })).toBeTruthy()
    expect(container.textContent).toContain(m.logout.intro)
    const submit = getByRole('button', { name: m.logout.submit })
    expect(submit.getAttribute('type')).toBe('button')
    expect(submit.className).toContain('ppg-cta')
    expect(getByRole('navigation', { name: m.selector.label }).querySelector('#ppga-locale-selector')).toBeTruthy()
    expect(container.querySelector('header')).toBeFalsy()
    expect(container.querySelector('footer')).toBeFalsy()
    expect(container.querySelector('.ppg-menu-toggle')).toBeFalsy()
    cleanup()
  }
})

/**
 * Source-assertions (the shipped design-system pattern): the submit MECHANICS
 * are untouched (#3's fetch handlers, the JSON bodies), and the menu toggle
 * can never render on a title screen — the `MenuWrap` button lives inside
 * `Nav`, which only the framed Shell branch composes.
 */
test('the title screens keep the #3 mechanics and the toggle never rides them (source)', async () => {
  const fs = await import('node:fs')
  const login = fs.readFileSync('app/[locale]/login/page.tsx', 'utf8')
  const logout = fs.readFileSync('app/[locale]/logout/page.tsx', 'utf8')
  expect(login).toContain("fetch('/api/auth/login'")
  expect(login).toContain('formSchema.safeParse')
  expect(logout).toContain("fetch('/api/auth/logout'")
  expect(logout).toContain('{ confirm: true }')
  const shell = fs.readFileSync('components/Shell.tsx', 'utf8')
  // `Nav` (the only `MenuWrap` consumer) is composed in the FRAMED return —
  // after the standalone branch already returned the stage.
  const standaloneAt = shell.indexOf('if (standalone)')
  const navAt = shell.indexOf('<Nav ')
  expect(standaloneAt).toBeGreaterThan(-1)
  expect(navAt).toBeGreaterThan(standaloneAt)
  const nav = fs.readFileSync('components/Nav.tsx', 'utf8')
  expect(nav).toContain('<MenuWrap')
})
