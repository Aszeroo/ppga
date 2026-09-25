/**
 * @vit-environment jsdom
 */
import { vi } from 'vitest'

// Next 16 ships `next/navigation` as a bare root module that Node's ESM
// resolver fails in jsdom (no `exports` map, no `next/navigation.js`), and the
// next-intl navigation wrappers (createNavigation) import it. Mock the bare
// import so jsdom never resolves it for real; the selector test only asserts
// DOM attributes, it never navigates for real.
vi.mock('next/navigation', () => ({
  // The navigation wrappers (createNavigation / createSharedNavigationFns)
  // import all of these; the selector never navigates for real, so they are
  // inert functions.
  useRouter: () => ({ replace: () => undefined }),
  usePathname: () => undefined,
  redirect: () => undefined,
  permanentRedirect: () => undefined,
}) as never)

import { render, cleanup } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, test, expect } from 'vitest'

afterEach(() => cleanup())

import { LanguageSelectorSelect } from '../../components/LanguageSelectorSelect'
import { type Locale } from '../../lib/i18n/locales'
import { mergeMessages } from '../../lib/i18n/messages-merge'
import { humanReadableFallback } from '../../lib/i18n/fallbackText'

import thMessages from '../../messages/th.json'
import enMessages from '../../messages/en.json'

/**
 * Ticket #4 selector accessibility, component test (CI runs it in jsdom): the
 * selector is keyboard-accessible (a real `select` the keyboard reaches), its
 * `aria-label` names the control, the current language is visible (
 * `aria-current` on the current option — never colour alone), and the copy is
 * the selected language's text — no raw key and no `undefined` on the label.
 */
test('selector is labelled, shows current language and is keyboard accessible', () => {
  const labels = {
    label: 'Language',
    option: { th: 'ไทย (ภาษาไทย)', en: 'English' },
  }

  for (const locale of ['th', 'en'] as Locale[]) {
    const messages = mergeMessages(locale, { th: thMessages, en: enMessages })
    const { getByRole } = render(
      <NextIntlClientProvider locale={locale} messages={messages}>
        <LanguageSelectorSelect labels={labels} />
      </NextIntlClientProvider>,
    )
    // A real `select` is a listbox role (interactive, keyboard-focusable).
    const select = getByRole('listbox')
    expect(select.getAttribute('aria-label')).toBe(labels.label)
    expect(select.getAttribute('id')).toBe('ppga-locale-selector')
    expect(select.getAttribute('data-current-locale')).toBe(locale)
    expect(select.getAttribute('tabIndex')).toBe('0')

    const options = Array.from(select.querySelectorAll('option'))
    const current = options.find((option: HTMLOptionElement) => option.getAttribute('aria-current') === 'true')
    expect(current).toBeTruthy()
    expect(current?.getAttribute('value')).toBe(locale)
    expect(options.length).toBe(2)
    cleanup()
  }
})

test('selector label is the selected language copy, never a raw key or undefined', () => {
  const messages = mergeMessages('th', { th: thMessages, en: enMessages })
  const { getByRole } = render(
    <NextIntlClientProvider
      locale="th"
      messages={messages}
      getMessageFallback={({ key, namespace }: { key: string; namespace?: string }) => humanReadableFallback(key, namespace)}
    >
      <LanguageSelectorSelect
        labels={{
          // The server-rendered label for the Thai page; a missing key never
          // comes from the raw key path or `undefined`.
          label: thMessages.selector.label,
          option: { th: thMessages.selector.option.th, en: thMessages.selector.option.en },
        }}
      />
    </NextIntlClientProvider>,
  )
  const select = getByRole('listbox')
  expect(select.getAttribute('aria-label')).toContain('ภาษา')
  expect(select.getAttribute('aria-label')).not.toContain('selector.notAKey')
  expect(select.getAttribute('aria-label')).not.toContain('undefined')
})
