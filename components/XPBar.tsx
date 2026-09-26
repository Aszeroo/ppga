"use client"

import { type CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

/**
 * The XPBar primitive — the gamified XP meter. The numeral is the
 * heading-role `--font-ta16bit` (`--ppg-xp-numeral`) so a swap of the
 * single-token swap point re-tunes the XP digits + the button / badge /
 * heading face all at once. The `progressbar` role + the `aria-valuenow`
 * is the state read (never hue alone), the pastel-pink/blue fill is the
 * `--ppg-pink-accent` / `--ppg-blue-200` token pair, and the stepped
 * `--ppg-shadow-pixel-*` is the 8-bit depth. The reduced-motion rule in
 * `app/globals.css` (`:where(.ppg-xp-bar…){ animation/transition-duration:
 * 0s }`) keeps the 8-bit fill discrete when the system says so.
 */
export interface XPBarProps {
  xp: number
  level?: number
}

export function XPBar({ xp, level = 0 }: XPBarProps) {
  const t = useTranslations('gallery')

  const style: CSSProperties = {
    borderWidth: 'var(--ppg-border-1)',
    borderColor: 'var(--ppg-blue-300)',
    borderStyle: 'solid',
    backgroundColor: 'var(--ppg-blue-200)',
    boxShadow: 'var(--ppg-shadow-pixel-1)',
    fontFamily: 'var(--font-mitr)',
  }

  return (
    <div
      className="ppg-xp-bar"
      data-ppg-level={level}
      role="progressbar"
      aria-valuenow={xp}
      aria-valuemin={0}
      aria-valuemax={255}
      aria-label={t('xp.label')}
      aria-valuetext={`${t('xp.value')} ${xp}`}
      tabIndex={0}
      style={style}
    >
      <div
        className="ppg-xp-fill"
        aria-hidden="true"
        style={{
          width: `${(xp / 255) * 100}%`,
          backgroundColor: 'var(--ppg-pink-accent)',
          transition: 'width 0.3s steps(8)', // 8-bit stepped, off in reduced-motion
        }}
      />
      <span className="ppg-xp-numeral" style={{ fontFamily: 'var(--font-ta16bit), var(--font-mitr)' }}>
        {xp}
      </span>
    </div>
  )
}
