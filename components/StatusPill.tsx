"use client"

import { type CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

/**
 * The StatusPill primitive — the small pixel capsule that reports a lesson
 * status. The 4 tokens map colour; the pill is always the pill's *own*
 * `aria-label` text + the `role="status"` so the alert is announced too —
 * state never rides the hue alone (`app/globals.css`'s `.ppg-state-locked`
 * stripe + the `“Locked”` prefix). A focusable `tabIndex` reaches the pill
 * by keyboard.
 *
 * Tokens only: the `--ppg-status-{success|warning|error|locked}` colour,
 * the pastel-blue face, the pixel border. The heading-role family
 * (`--font-ta16bit`) reads the numeral badge inside the pill with the same
 * per-glyph Mitr fallback — a Thai status label falls to Mitr.
 */
export interface StatusPillProps {
  label: string
  tone: 'success' | 'warning' | 'error' | 'locked'
}

export function StatusPill({ label, tone }: StatusPillProps) {
  const t = useTranslations('gallery')

  const style: CSSProperties = {
    fontFamily: 'var(--font-ta16bit), var(--font-mitr)',
    backgroundColor: 'var(--ppg-blue-100)',
    borderWidth: 'var(--ppg-border-2)',
    borderStyle: 'solid',
    borderColor:
      tone === 'success'
        ? 'var(--ppg-status-success)'
        : tone === 'warning'
          ? 'var(--ppg-status-warning)'
          : tone === 'error'
            ? 'var(--ppg-status-error)'
            : 'var(--ppg-status-locked)',
    color: 'var(--ppg-blue-500)',
    boxShadow: 'var(--ppg-shadow-pixel-1)',
    padding: 'var(--ppg-space-1) var(--ppg-space-3)',
  }

  return (
    <span
      className="ppg-status-pill"
      data-ppg-tone={tone}
      role="status"
      aria-label={`${t(`tones.${tone}`)} — ${label}`}
      tabIndex={0}
      style={style}
    >
      {label}
    </span>
  )
}
