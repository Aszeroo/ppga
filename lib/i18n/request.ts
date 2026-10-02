// fallow-ignore-file unused-file // next.config's createNextIntlPlugin reads this by path, not import.
import 'server-only'

import { cookies } from 'next/headers'

import { getRequestConfig } from 'next-intl/server'
import { type IntlError } from 'use-intl/core'

import { locales, type Locale } from './routing'
import { mergeMessages } from './messages-merge'
import { humanReadableFallback } from './fallbackText'

/**
 * Ticket #4 request config: the locale for SERVER-rendered copy follows
 * next-intl's locale-prefixed-routes design — the `[locale]` segment the
 * routing middleware matched from the URL wins first (`requestLocale`); the
 * `ppga-locale` cookie the routing middleware writes on every switch (see
 * routing.ts / localeCookie.ts) is the fallback for any pathname the segment
 * does not carry; the platform's default `th` is the last resort.
 *
 * PPGA #18 (the finding that is this fix): reading the cookie ALONE — as
 * Ticket #4 shipped — was the bug: an anonymous first hit of an `/en/*`
 * pathname carried no locale cookie and SSR-rendered Thai copy pre-hydration.
 * The URL prefix must win for server-rendered copy, per the routing design.
 *
 * The human-readable fallback (see fallbackText.ts) renders missing keys as
 * text — never the raw key path or `undefined`. The fallback chain is: the
 * selected locale's messages, merged over the other locale's messages (deep
 * merge, selected wins) so a missing key falls to the other language before
 * the human-readable text.
 */
/** The SERVER copy's locale chain (next-intl's documented priorities for the
 * prefixed routes): the `[locale]` segment first, the `ppga-locale` cookie
 * next, the platform default `th` last. */
function serverLocale(requested: string | undefined, cookieLocale: string | undefined | null): Locale {
  const candidates = [requested ?? '', cookieLocale ?? '']
  return (candidates.find((candidate) => locales.includes(candidate as Locale)) as Locale) ?? 'th'
}

export default getRequestConfig(
  async ({ requestLocale }: { requestLocale?: Promise<string | undefined> }) => {
    const requested = await requestLocale
    const store = await cookies()
    const locale = serverLocale(requested, store.get('ppga-locale')?.value)

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
  },
)
