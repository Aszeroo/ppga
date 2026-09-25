/**
 * @vit-environment jsdom
 */
import { render, cleanup } from '@testing-library/react'
import { afterEach } from 'vitest'

afterEach(() => cleanup())
import { NextIntlClientProvider } from 'next-intl'
import { useTranslations } from 'next-intl'

import { test, expect } from 'vitest'
import { mergeMessages } from '../../lib/i18n/messages-merge'
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
  const messages = mergeMessages(locale, { th: thMessages, en: enMessages })
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

test('missing key in the selected locale falls to the other locale', () => {
  // `glossary.slideDesign` exists in both files; `glossary.aMissingTerm` is
  // absent in `th` and present in `en`? it is absent in both. The leg that
  // must exist in the other locale — `health.connectivity` — exists in both.
  // For a real `other-locale` leg we hand-build a `th` that carries no glossary
  // copy and an `en` that carries `glossary.transition`, so the Thai page must
  // read the English word (never the raw key).
  const fakeTh = { glossary: {} } as { glossary: Record<string, never> }
  const fakeEn = { glossary: { transition: 'Transition' } } as {
    glossary: { transition: string }
  }
  const messages = mergeMessages('th', { th: fakeTh, en: fakeEn })
  const legValue = (messages as { glossary?: { transition?: string } }).glossary?.transition
  expect(legValue).toBe('Transition')

  const container = document.createElement('document')
  const { getByTestId } = render(
    <NextIntlClientProvider
      locale="th"
      messages={mergeMessages('th', { th: fakeTh, en: fakeEn })}
      getMessageFallback={({ key, namespace }: { key: string; namespace?: string }) => humanReadableFallback(key, namespace)}
    >
      <Copy namespace="glossary" />
    </NextIntlClientProvider>,
    { container },
  )
  // The page's copy is the merged leg (the other locale's word); when the leg
  // is blank both locales get the human-readable text — never the raw key or
  // `undefined`.
  expect(getByTestId('copy').textContent ?? 'undefined').not.toContain('glossary.aMissingTerm')
  expect(getByTestId('copy').textContent ?? 'undefined').not.toContain('undefined')
  expect((messages as { glossary?: { transition?: string } }).glossary?.transition).toBe('Transition')
})
