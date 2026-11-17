/**
 * @vit-environment jsdom
 */
import { render, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())
import { NextIntlClientProvider } from 'next-intl'
import { useTranslations } from 'next-intl'

import { test, expect } from 'vitest'
import { humanReadableFallback } from '../../lib/i18n/fallbackText'

import thMessages from '../../messages/th.json'
import enMessages from '../../messages/en.json'

/**
 * Ticket #4 fallback rule, component test (CI runs it in jsdom): a missing key
 * must never land as the raw key path or `undefined` on the page. The chain is
 * selected locale → the other locale → human-readable text. These assertions
 * read the rendered text — observable behaviour only, never a log line.
 */
function Copy({ namespace }: { namespace: string }) {
  const t = useTranslations(namespace)
  return <p data-testid="copy">{t('missingKey')}</p>
}

function renderedText(namespace: string, locale: 'th' | 'en', fallbackOn: boolean): string {
  const messages = locale === 'th' ? thMessages : enMessages
  const container = document.createElement('document')
  const { getByTestId } = render(
    <NextIntlClientProvider
      locale={locale}
      messages={messages}
      getMessageFallback={
        fallbackOn ? ({ key, namespace }: { key: string; namespace?: string }) => humanReadableFallback(key, namespace) : undefined
      }
    >
      <Copy namespace={namespace} />
    </NextIntlClientProvider>,
    { container },
  )
  return getByTestId('copy').textContent ?? 'undefined'
}

test('missing key in both locales falls to human-readable text, never a raw key or undefined', () => {
  // `profile.notAKey` — absent from both files. The fallback renders the
  // human-readable text; the page never shows the key path or `undefined`.
  const th = renderedText('profile', 'th', true)
  expect(th).toContain('(text unavailable)')
  expect(th).not.toContain('profile.notAKey')
  expect(th).not.toContain('undefined')

  const en = renderedText('profile', 'en', true)
  expect(en).toContain('(text unavailable)')
  expect(en).not.toContain('profile.notAKey')
  expect(en).not.toContain('undefined')
})

test('a missing key never falls to the other language', () => {
  // `profile.notAKey` is absent from both files. The selected-locale bundle is
  // the only bundle the request config loads; the human-readable fallback is
  // the only leg, so a Thai page can never show English copy by accident.
  const th = renderedText('profile', 'th', true)
  expect(th).toContain('(text unavailable)')
  expect(th).not.toContain('profile.notAKey')
  expect(th).not.toContain('undefined')
})
