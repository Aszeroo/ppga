"use client"

import { type CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

/**
 * The Card primitive — the pastel-blue 8-bit surface a slide / a lesson
 * lives on. A real focusable `section` (`.ppg-card` is the focus target) so
 * the keyboard reaches it, the pixel shadow (`--ppg-shadow-pixel-*`) steps
 * the 8-bit depth, and the border is a pixel (`--ppg-border-1`) not a
 * smoothing curve.
 *
 * Tokens only. The heading role inside the card resolves the single-token
 * swap point `--font-ta16bit` with a Mitr fallback per glyph; the body text
 * inside rides Mitr (`--font-mitr`) for the long-form Thai readability. No
 * ad-hoc colour is here: the accent border is the `--ppg-blue-300` token.
 */
export interface CardProps {
  heading: string
  body: string
  status?: 'available' | 'locked' | 'warning' | 'error'
}

export function Card({ heading, body, status = 'available' }: CardProps) {
  const t = useTranslations('gallery')

  const locked = status === 'locked'

  const style: CSSProperties = {
    backgroundColor: locked ? 'var(--ppg-state-locked-bg)' : 'var(--ppg-bg-surface)',
    color: locked ? 'var(--ppg-state-locked-fg)' : 'var(--ppg-fg-heading)',
    borderWidth: 'var(--ppg-border-1)',
    borderColor: locked ? 'var(--ppg-status-locked)' : 'var(--ppg-blue-300)',
    borderStyle: 'solid',
    boxShadow: 'var(--ppg-shadow-pixel-2)',
    padding: 'var(--ppg-space-3)',
    fontFamily: 'var(--font-mitr)',
  }

  return (
    <section
      // the `.ppg-card` class is the `:focus-visible` ring target in globals.css
      className="ppg-card"
      data-ppg-state={status}
      aria-label={`${t(`states.${status}`)} — ${heading}`}
      tabIndex={0}
      style={style}
    >
      <h1
        className="ppg-heading ppg-heading-text"
        style={{ fontFamily: 'var(--font-ta16bit), var(--font-mitr)' }}
      >
        {heading}
      </h1>
      <p className="ppg-card-text">{body}</p>
    </section>
  )
}
