"use client"

import { type CSSProperties } from 'react'

import { useTranslations } from 'next-intl'

/**
 * The ProgressBar primitive — the pastel-pink pixel bar that fills with the
 * lesson completion. The `progressbar` role is native (the `aria-valuenow`
 * + `aria-valuemin/max` read the number aloud) so the state is not hue alone
 * again; the bar's `--ppg-pink-accent` fill is a token, the pastel-blue
 * track is a token, the stepped `--ppg-shadow-pixel-*` is the 8-bit depth.
 *
 * Respect reduced-motion (`app/globals.css`): the `.ppg-progress-bar` class
 * carries the `transition/animation` off so a keyboard-press does not ease.
 * The number inside the bar is the heading-role `--font-ppg-display` — the XP
 * digits share the single-token swap point with the badge.
 */
export interface ProgressBarProps {
  value: number
  min?: number
  max?: number
  /** Optional region name override (the Course Map names its own progress:
   * `course.progressCleared`); the gallery default stays `gallery.progress.label`. */
  label?: string
}

export function ProgressBar({ value, min = 0, max = 100, label }: ProgressBarProps) {
  const t = useTranslations('gallery')

  const style: CSSProperties = {
    // the `.ppg-progress-bar` class is the reduced-motion + focus ring target
    borderWidth: 'var(--ppg-border-1)',
    borderColor: 'var(--ppg-blue-300)',
    borderStyle: 'solid',
    backgroundColor: 'var(--ppg-blue-200)',
    boxShadow: 'var(--ppg-shadow-pixel-1)',
    fontFamily: 'var(--font-ppg-body)',
  }

  return (
    <div
      className="ppg-progress-bar"
      role="progressbar"
      aria-valuenow={value}
      aria-valuemin={min}
      aria-valuemax={max}
      aria-label={label ?? t('progress.label')}
      tabIndex={0}
      aria-valuetext={`${t('progress.value')} ${value}/${max}`}
      style={style}
    >
      <div
        className="ppg-progress-fill"
        aria-hidden="true"
        style={{
          width: `${(value / (max - min)) * 100}%`,
          backgroundColor: 'var(--ppg-pink-accent)',
          transition: 'width 0.3s steps(8)', // 8-bit stepped fill, off in reduced-motion
        }}
      />
      <span className="ppg-progress-text ppg-xp-numeral" style={{ fontFamily: 'var(--font-ppg-display), var(--font-ppg-body)' }}>
        {value}
      </span>
    </div>
  )
}
