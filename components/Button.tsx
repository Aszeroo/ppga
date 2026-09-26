"use client"

import { type CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

import { LockedState } from './State'

/**
 * The 8-bit Button primitive. Its role is a real `button` (native keyboard +
 * focus) and its label is the translated `aria-label` so a screen-reader
 * speaks the action, not just the pixel face.
 *
 * Tokens only: every colour / border / shadow / font resolves a `var(--ppg-…)
 * `from `app/globals.css` (no ad-hoc colors). The heading-role family is the
 * single-token swap point `--font-ta16bit` with the Mitr fallback per glyph —
 * a Thai button label falls to Mitr automatically (`app/fonts/LICENSE-TA16BIT
 * .md`). The focus ring is a *visible* one (outline + thickened border) and
 * the `:focus-visible` rule in `app/globals.css` rides the `.ppg-button` class
 * here, so focus is never conveyed by hue-shift only.
 *
 * Variants: `available` is the default pastel-pink action surface; the
 * `locked` variant routes through `LockedState` (striated background +
 * `aria-disabled`) and the locked status is announced by a `“Locked”` text
 * prefix (`data-ppg-state="locked"`) as well as by the stripes — state never
 * rides colour alone.
 */
export interface ButtonProps {
  label: string
  status?: 'available' | 'locked' | 'warning' | 'error'
  busy?: boolean
  tone?: 'primary' | 'danger' | 'accent'
}

export function Button({ label, status = 'available', busy, tone }: ButtonProps) {
  const t = useTranslations('gallery')
  const locked = status === 'locked'

  const base: CSSProperties = {
    // heading / button role → TA16BIT first, Mitr next (Thai falls per glyph)
    fontFamily: 'var(--font-ta16bit), var(--font-mitr)',
    borderWidth: 'var(--ppg-border-2)',
    borderStyle: 'solid',
    borderColor: locked ? 'var(--ppg-state-locked-fg)' : 'var(--ppg-blue-300)',
    backgroundColor: locked ? 'var(--ppg-state-locked-bg)' : 'var(--ppg-state-available-bg)',
    color: locked ? 'var(--ppg-state-locked-fg)' : 'var(--ppg-state-available-fg)',
    boxShadow: 'var(--ppg-shadow-pixel-1)',
    padding: 'var(--ppg-space-2) var(--ppg-space-3)',
    ...(busy ? { cursor: 'progress' } : {}),
  }

  const toneStyle: CSSProperties | undefined = tone
    ? {
      borderColor:
        tone === 'danger'
          ? 'var(--ppg-status-error)'
          : tone === 'accent'
            ? 'var(--ppg-blue-accent)'
            : 'var(--ppg-pink-accent)',
    }
    : undefined

  return (
    <button
      // the `.ppg-button` class is the focus ring's target in `app/globals.css`
      className="ppg-button"
      data-ppg-state={status}
      data-ppg-busy={busy ? 'true' : undefined}
      type="button"
      aria-label={`${t(`states.${status}`)} — ${label}`}
      disabled={locked || busy}
      style={{ ...base, ...toneStyle }}
    >
      {locked ? <LockedState label={label}>{label}</LockedState> : label}
    </button>
  )
}
