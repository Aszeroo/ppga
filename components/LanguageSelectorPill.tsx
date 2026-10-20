"use client"

import { useTranslations } from 'next-intl'

import { LanguageSelectorSelect } from './LanguageSelectorSelect'

/**
 * PPGA #49 (login title-screen fidelity): the IN-CARD language switch — the
 * V3 design's `.lang-sw` pill row for the STANDALONE title screens (login /
 * logout). The title screens render outside the Shell frame, and their own
 * pages are Client Components, so the server `LanguageSelector` cannot ride
 * inside the card's children — this is the same switch rebuilt client-side:
 * the identical `nav[aria-label=selector.label]` landmark wrapping the
 * identical `LanguageSelectorSelect` (the real `select`, the `#ppga-locale-selector`
 * id, the `/api/locale` POST + the `router.replace(pathname, { locale })`
 * navigation, `aria-current` on the current option — every mechanism and every
 * attribute byte-for-byte what the server component renders; only the label
 * resolution moved from `getTranslations` to the client `useTranslations`,
 * same keys, same fallback chain).
 *
 * The pill face is the shipped `.ppg-lang-compact` class (the design's
 * `.lang-sw span` pill geometry) inside the `.ppg-lang-sw` centered row —
 * no colour, no literal in this file (the token-purity discipline).
 */
export function LanguageSelectorPill() {
  const t = useTranslations('selector')

  return (
    <nav aria-label={t('label')} className="ppg-lang-sw">
      <LanguageSelectorSelect
        labels={{
          label: t('label'),
          option: { th: t('option.th'), en: t('option.en') },
        }}
      />
    </nav>
  )
}
