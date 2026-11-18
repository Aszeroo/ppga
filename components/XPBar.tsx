"use client"

import { type CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

/**
 * The XPBar primitive — the gamified XP meter. The numeral is the
 * heading-role `--font-ppg-display` (`--ppg-xp-numeral`) so a swap of the
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

  // `ppg_xp_summary` derives level = floor(total/100)+1, so one level is 100
  // XP wide. The meter shows the progress INSIDE the current level; the old
  // `xp/255` fill (and the numeral printed on top of it) was arbitrary and
  // read the total as if it were level progress.
  const step = 100
  const withinLevel = Math.max(0, Math.min(step, xp - (level > 0 ? (level - 1) * step : 0)))
  const valuemax = level > 0 ? level * step : 255

  const style: CSSProperties = {
    borderWidth: 'var(--ppg-border-1)',
    borderColor: 'var(--ppg-blue-300)',
    borderStyle: 'solid',
    backgroundColor: 'var(--ppg-blue-200)',
    boxShadow: 'var(--ppg-shadow-pixel-1)',
    fontFamily: 'var(--font-ppg-body)',
  }

  return (
    <div
      className="ppg-xp-bar"
      data-ppg-level={level}
      role="progressbar"
      aria-valuenow={xp}
      aria-valuemin={0}
      aria-valuemax={valuemax}
      aria-label={t('xp.label')}
      aria-valuetext={`${t('xp.value')} ${xp}`}
      tabIndex={0}
      style={style}
    >
      <div
        className="ppg-xp-fill"
        aria-hidden="true"
        style={{
          width: `${(withinLevel / step) * 100}%`,
          backgroundColor: 'var(--ppg-pink-accent)',
          transition: 'width 0.3s steps(8)', // 8-bit stepped, off in reduced-motion
        }}
      />
      <span className="ppg-xp-numeral">
        {withinLevel} / {step}
      </span>
    </div>
  )
}
