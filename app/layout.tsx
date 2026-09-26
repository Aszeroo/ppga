import type { Metadata } from 'next'
import type { ReactNode } from 'react'

import { getLocale } from 'next-intl/server'
import { NextIntlClientProvider } from 'next-intl'

import localFont from 'next/font/local'
import { Mitr } from 'next/font/google'

import { LanguageSelector } from '../components/LanguageSelector'
import { Header } from '../components/Header'

import './globals.css'

/**
 * Ticket #5 fonts: the `TA-16-Bit.zip` font ships `.ttf` only (no
 * `woff2_compress` in this environment — see `app/fonts/LICENSE-TA16BIT.md`)
 * so it is embedded via `next/font/local` as a sanctioned file format and
 * served at `/_next/static/media/*.ttf`. `next/font/local` validates the
 * `/.(woff|woff2|eot|ttf|otf)$` file-extension, so `.ttf` is fine.
 *
 * The heading / button / badge / XP-numeral role resolves the
 * **`--font-ta16bit`** variable ONLY — that single CSS variable is the
 * single-token swap point for the TA 16 BIT family. `next/font/google`'s
 * `Mitr` is the body / long-form-Thai role (the `thai` subset is fetched).
 * TA16BIT's `cmap` is Latin+digits-only, so a Thai heading falls to Mitr per
 * glyph in the family stack (`--font-ta16bit, --font-mitr`, `app/globals.css`)
 * — the fallback chain is native browser behaviour, not a hand-written
 * `unicode-range` clone.
 *
 * The classes ride `<html>` + `<body>` so both variables are inline-set once
 * on the document; every token a component consumes comes from
 * `app/globals.css` (`--ppg-*`), never an ad-hoc colour.
 */
const ta16bit = localFont({
  src: './fonts/TA16BIT-Regular.ttf',
  weight: '400',
  style: 'normal',
  display: 'fallback',
  preload: true,
  // TA16BIT's own metrics are the 8-bit ones; a generated metric-adjusted
  // fallback face would make the Thai gap read non-8-bit, so the fallback
  // generation is off and the real fallback is the Mitr family in the stack.
  adjustFontFallback: false,
  fallback: ['Mitr'],
  variable: '--font-ta16bit',
})

const mitr = Mitr({
  weight: '400',
  style: 'normal',
  display: 'fallback',
  preload: true,
  subsets: ['thai', 'latin'],
  variable: '--font-mitr',
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
      className={ta16bit.variable}
    >
      <body className={mitr.variable}>
        <NextIntlClientProvider>
          <LanguageSelector />
          <Header />
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  )
}
