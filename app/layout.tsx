import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { getLocale } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'

import { Noto_Sans_Thai, Press_Start_2P } from 'next/font/google'

import './globals.css'

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

export const metadata: Metadata = {
  title: 'PPGA — Gamified PowerPoint Learning Platform',
  description:
    'A bilingual (Thai/English) gamified web platform for ปวช.2 vocational learners to build real Microsoft PowerPoint presentation-creation skills.',
}

export default async function RootLayout({ children }: Readonly<{ children: ReactNode }>) {
  const locale = await getLocale()

  return (
    <html
      lang={locale === 'th' ? 'th' : 'en'}
      className={ppgDisplay.variable}
    >
      <body className={ppgBody.variable}>
        <NextIntlClientProvider>{children}</NextIntlClientProvider>
      </body>
    </html>
  )
}
