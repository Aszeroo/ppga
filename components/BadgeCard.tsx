"use client"

import { useTranslations } from 'next-intl'

/**
 * The BadgeCard primitive — the V3 gallery's `#s-badges` badge card that
 * names an earned or locked achievement. A real focusable `section`
 * (`.ppg-badge-card` + the `.ppg-card` focus target) so the keyboard reaches
 * it; the pixel icon circle (`.ppg-badge-icon`) is `aria-hidden` decoration,
 * NEVER a state marker alone.
 *
 * Tokens only. The heading role inside the card resolves the single-token
 * swap point `--font-ppg-display` with a Noto Sans Thai fallback per glyph;
 * the body text inside rides Noto Sans Thai (`--font-ppg-body`) for the
 * long-form Thai readability. No ad-hoc colour is here: the earned border is
 * the `--ppg-gold-border` token, the locked border is
 * `--ppg-status-locked`; the literal hexes for the idiom (the gold icon
 * circle, the grayscale locked circle) live ONLY in `app/globals.css`.
 *
 * The earned/locked state is the card's own `data-ppg-state` + the
 * heading/body `ppg-heading`/`ppg-card-text` classes (the documented contrast
 * allowance pair keyed on THOSE two names, locked-card-only in practice) +
 * the StatusPill/Badge copy+icon markers that the page renders beside it.
 */
export interface BadgeCardProps {
  heading: string
  body: string
  status: 'available' | 'locked'
  icon: string
}

export function BadgeCard({ heading, body, status, icon }: BadgeCardProps) {
  const t = useTranslations('gallery')

  return (
    <section
      className="ppg-badge-card"
      data-ppg-state={status}
      aria-label={`${t(`states.${status}`)} — ${heading}`}
      tabIndex={0}
    >
      <span className="ppg-badge-icon" aria-hidden="true">
        {icon}
      </span>
      <h1 className="ppg-heading">{heading}</h1>
      <p className="ppg-card-text">{body}</p>
    </section>
  )
}
