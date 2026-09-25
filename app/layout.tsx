import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { getLocale } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'

import { LanguageSelector } from '../components/LanguageSelector'

/**
 * Ticket #4 root layout: the `html` document carries the active locale (the
 * browser tells a screen-reader which voice to read aloud) and
 * `NextIntlClientProvider` makes the translations reachable to the Client
 * Components — the interactive part of the language selector. The selector
 * sits inside the provider so it can read `useTranslations` and `useLocale` on
 * every page, while its `options` stay server-rendered (Ticket #3's role-guard
 * middleware still gates the page tree around it).
 */
export const metadata: Metadata = {
  title: 'PPGA — Gamified PowerPoint Learning Platform',
  description:
    'A bilingual (Thai/English) gamified web platform for ปวช.2 vocational learners to build real Microsoft PowerPoint presentation-creation skills.',
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale()

  return (
    <html lang={locale === 'th' ? 'th' : 'en'}>
      <body>
        <NextIntlClientProvider>
          <LanguageSelector />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
