import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { getLocale, getMessages } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'

import { LocaleLangSync } from '../components/LocaleLangSync'

import { Noto_Sans_Thai, Press_Start_2P } from 'next/font/google'

import './globals.css'

/** Keep the function next to the Supabase project (ap-southeast-1) where the
 * Vercel plan allows region selection. */
export const preferredRegion = 'sin1'

/**
 * ADR-0004 / ticket #50 fonts: the V3 design system's type pair, loaded via
 * `next/font/google`.
 *
 * `Press_Start_2P` is the **display** role (logo, headings, labels, numerals)
 * and is ASCII-only by design — a Thai display string falls through to the
 * body family per glyph in the stack (`--font-ppg-display, --font-ppg-body`,
 * `app/globals.css`), which is native browser behaviour, not a hand-written
 * `unicode-range` clone. `Noto_Sans_Thai` is the **body** role (the `thai`
 * subset carries every Thai glyph; `latin` covers ASCII body copy and the
 * display fallback). Body copy never uses the display font (brief §8).
 *
 * The classes ride `<html>` + `<body>` so both variables are inline-set once
 * on the document; every token a component consumes comes from
 * `app/globals.css` (`--ppg-*`), never an ad-hoc colour.
 */
const ppgDisplay = Press_Start_2P({
  weight: '400',
  style: 'normal',
  display: 'swap',
  preload: true,
  subsets: ['latin'],
  variable: '--font-ppg-display',
})

const ppgBody = Noto_Sans_Thai({
  weight: ['400', '500', '600', '700', '800'],
  style: 'normal',
  display: 'swap',
  preload: true,
  subsets: ['thai', 'latin'],
  variable: '--font-ppg-body',
})

/**
 * Only these namespaces are read by Client Components (`useTranslations`).
 * Everything else stays server-rendered, so the full message corpus is not
 * serialized into every page's HTML/hydration payload.
 */
const CLIENT_MESSAGE_NAMESPACES = [
  'gallery',
  'selector',
  'review',
  'login',
  'logout',
  'changePassword',
  'admin',
  'nav',
  'shell',
  'course',
  'challenge',
  'lessonPlayer',
] as const

export const metadata: Metadata = {
  title: 'PPGA — Gamified Presentation Program',
  description:
    'A bilingual (Thai/English) gamified CAI course for the vocational subject 21910-2006 Presentation Program, delivered as nine chapters with PowerPoint as the primary software example.',
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale()
  const allMessages = await getMessages()
  const clientMessages = Object.fromEntries(
    CLIENT_MESSAGE_NAMESPACES.flatMap((namespace) =>
      allMessages[namespace] ? [[namespace, allMessages[namespace]]] : [],
    ),
  )

  return (
    <html
      lang={locale === 'th' ? 'th' : 'en'}
      className={ppgDisplay.variable}
    >
      <body className={ppgBody.variable}>
        <NextIntlClientProvider locale={locale} messages={clientMessages}>
          <LocaleLangSync />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
