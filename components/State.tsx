"use client"

import { type CSSProperties, type ReactNode } from 'react'

import { useTranslations } from 'next-intl'

/**
 * The locked / available state wrappers. The whole ticket rule — **state is
 * never conveyed by colour alone** — is honoured here by a text+icon cue
 * (the “Locked” / “Available” prefix a screen-reader reads) + the native
 * `aria-disabled` / `aria-label` + the `.ppg-state-locked` stripe in
 * `app/globals.css`. The stripes are a *secondary* visual cue only.
 *
 * Tokens only again: the locked surface / foreground / stripe and the
 * available surface all resolve the `--ppg-state-*` custom properties. No
 * ad-hoc colour is in this file.
 */
export interface StateProps {
  label: string
  children: ReactNode
}

export function LockedState({ label, children }: StateProps) {
  const t = useTranslations('gallery')

  const style: CSSProperties = {
    // the `.ppg-state-locked` class carries the striated background + the
    // thickened border in `app/globals.css` — colour as a secondary cue
    backgroundImage: 'var(--ppg-state-locked-stripe)',
    borderColor: 'var(--ppg-status-locked)',
    color: 'var(--ppg-state-locked-fg)',
    borderWidth: 'var(--ppg-border-2)',
    borderStyle: 'solid',
    fontFamily: 'var(--font-ta16bit), var(--font-mitr)',
  }

  return (
    <span
      className="ppg-state-locked"
      data-ppg-state="locked"
      aria-disabled="true"
      aria-label={`${t('states.locked')} — ${label}`}
      style={style}
    >
      {children}
    </span>
  )
}

export function AvailableState({ label, children }: StateProps) {
  const t = useTranslations('gallery')

  const style: CSSProperties = {
    backgroundColor: 'var(--ppg-state-available-bg)',
    color: 'var(--ppg-state-available-fg)',
    borderWidth: 'var(--ppg-border-2)',
    borderColor: 'var(--ppg-pink-accent)',
    borderStyle: 'solid',
    fontFamily: 'var(--font-ta16bit), var(--font-mitr)',
  }

  return (
    <span
      className="ppg-state-available"
      data-ppg-state="available"
      aria-label={`${t('states.available')} — ${label}`}
      tabIndex={0}
      style={style}
    >
      {children}
    </span>
  )
}
