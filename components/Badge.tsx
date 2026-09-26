"use client"

import { type CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

/**
 * The Badge primitive — the pixel label that names a slide / a lesson rank.
 * Its face is the heading-role `--font-ta16bit` (a numeral badge reads the
 * XP digits in the same single-token-swap-pointed family) with a per-glyph
 * Mitr fallback for Thai labels. A focusable `status` badge is a real
 * `aria-label` so a screen-reader names it, not a pixel only.
 *
 * Tokens only: the pastel-pink face, the pastel-blue border, the pixel
 * shadow — all `var(--ppg-…)`. The `tone` badge maps its colour to the
 * `--ppg-status-*` token AND carries the same text/icon label in its
 * `aria-label`, so the state is never colour-alone again.
 */
export interface BadgeProps {
  text: string
  tone?: 'success' | 'warning' | 'error' | 'locked' | 'neutral'
}

export function Badge({ text, tone = 'neutral' }: BadgeProps) {
  const t = useTranslations('gallery')

  const style: CSSProperties = {
    fontFamily: 'var(--font-ta16bit), var(--font-mitr)',
    backgroundColor: 'var(--ppg-pink-200)',
    borderWidth: 'var(--ppg-border-1)',
    borderStyle: 'solid',
    borderColor: 'var(--ppg-blue-300)',
    color: 'var(--ppg-blue-500)',
    boxShadow: 'var(--ppg-shadow-pixel-1)',
    padding: 'var(--ppg-space-1) var(--ppg-space-2)',
  }

  return (
    <span
      className="ppg-badge"
      data-ppg-tone={tone}
      aria-label={`${t(`tones.${tone}`)} — ${text}`}
      tabIndex={0}
      style={style}
    >
      {text}
    </span>
  )
}
