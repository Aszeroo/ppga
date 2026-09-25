// fallow-ignore-file unused-file // next.config's createNextIntlPlugin reads this by path, not import.
import 'server-only'

import { cookies } from 'next/headers'

import { getRequestConfig } from 'next-intl/server'
import { type IntlError } from 'use-intl/core'

import { locales, type Locale } from './routing'
import { mergeMessages } from './messages-merge'
import { humanReadableFallback } from './fallbackText'

/**
 * Ticket #4 request config: the locale comes from the `ppga-locale` cookie the
 * routing middleware writes on every switch (see routing.ts) and the
 * human-readable fallback (see fallbackText.ts) renders missing keys as text —
 * never the raw key path or `undefined`.
 *
 * The fallback chain is: the selected locale's messages, merged over the other
 * locale's messages (deep merge, selected wins) so a missing key falls to the
 * other language before the human-readable text.
 */
export default getRequestConfig(async () => {
  const store = await cookies()
  const cookieLocale = store.get('ppga-locale')?.value
  const locale =
    cookieLocale && locales.includes(cookieLocale as Locale)
      ? (cookieLocale as Locale)
      : 'th'

  const messages = mergeMessages(locale, {
    th: (await import('../../messages/th.json')).default,
    en: (await import('../../messages/en.json')).default,
  })

  return {
    locale,
    messages,
    getMessageFallback: ({ key, namespace }: { key: string; namespace?: string }) =>
      humanReadableFallback(key, namespace),
    onError: (error: IntlError) => {
      // The fallback text is already on the page by `getMessageFallback`; we
      // log the missing key so the glossary can catch the drift.
      if (error.code === 'MISSING_MESSAGE') {
        console.warn(`[ppga i18n] missing message: ${error.originalMessage}`)
      }
    },
  }
})
