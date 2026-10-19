import 'server-only'

import { getTranslations } from 'next-intl/server'

import { type ReactNode } from 'react'

import { type CSSProperties } from 'react'

import { Link } from '../lib/i18n/routing'

import { LanguageSelector } from './LanguageSelector'
import { XPHud } from './XPHud'
import { Nav } from './Nav'
import { Card } from './Card'

/**
 * Ticket #41 stage 1: the one reusable Shell frame — the HUD-style top bar +
 * minimal footer that carries every authenticated surface under `[locale]`.
 * Built once, never re-implemented per page (the issue's Implementation
 * Decision); the login/logout paths stay OUTSIDE the frame as standalone 8-bit
 * title/start screens (`standalone` prop from the locale layout).
 *
 * Desktop composition (the issue verbatim): LEFT = the pixel product identity
 * (`shell.identity`) + the contextual Course/Module title the layout derives
 * (`contextTitle`); CENTER = the role-gated primary nav (`Nav`); RIGHT = the
 * language selector (`LanguageSelector`) + the player HUD (`XPHud`, the
 * `Header`'s rename) + logout (`nav.logout`). Minimal footer = the exact
 * attribution string from the issue (`shell.footerAttribution` + its English
 * line) + the Health link; no personal or institutional names.
 *
 * Accessibility / the ticket's cross-cutting stories: `header` role=banner,
 * `nav` (inside the header) role=navigation, `footer` role=contentinfo — the
 * three landmarks carry correct ARIA names (`shell.navLabel`,
 * `shell.footerHealth`); the children ride an UNLABELLED `section` so the
 * page's own `<main>` (the journey's stages) never duplicates the Shell's
 * landmark (axe `duplicate-landmark`). State is never colour-only: the
 * tokens `--ppg-*` carry the pixel styling (`Card`/`State` surfaces), the
 * focus ring rides the `.ppg-*` class rules in `app/globals.css`.
 *
 * Tokens only: every colour / border / shadow / font below resolves a
 * `var(--ppg-…)` custom property from `app/globals.css` (no ad-hoc colours);
 * the `--ppg-*` ramp + the `--font-ta16bit` / `--font-mitr` single-token
 * swap points are the only palette. Reduced-motion + keyboard access: the
 * `.ppg-shell-*` classes are the focus-ring + reduced-motion targets there.
 */
export interface ShellProps {
  /** The session/profile role (the issue's role→nav-items mapping is
   * server-derived; hiding is not the security mechanism — RLS stays
   * authoritative at the row level). A caller with no role sees NO nav. */
  role?: 'learner' | 'teacher' | 'admin'
  /** The contextual Course/Module title (where appropriate — the layout
   * derives it from the pathname over the existing `course.*` copy). */
  contextTitle?: string | null
  /** Login/logout render standalone as the 8-bit title/start screens — the
   * Shell returns the title screen (identity + `shell.start` + the children),
   * never the HUD bar / nav / footer. */
  standalone?: boolean
  children: ReactNode
}

export async function Shell({ role, contextTitle, standalone, children }: ShellProps) {
  const t = await getTranslations('shell')
  const navT = await getTranslations('nav')

  const style: CSSProperties = {
    fontFamily: 'var(--font-ta16bit), var(--font-mitr)',
  }

  /** The 8-bit title/start screen — the login/logout frame. */
  if (standalone) {
    return (
      <section
        className="ppg-title-screen"
        data-ppg-standalone="true"
        aria-label={`${t('identity')} — ${t('start')}`}
        style={{
          ...style,
          backgroundColor: 'var(--ppg-bg-surface)',
          color: 'var(--ppg-fg-heading)',
          borderWidth: 'var(--ppg-border-3)',
          borderColor: 'var(--ppg-blue-300)',
          borderStyle: 'solid',
          boxShadow: 'var(--ppg-shadow-pixel-3)',
          padding: 'var(--ppg-space-5)',
        }}
      >
        <h1 className="ppg-heading ppg-heading-text" style={{ fontFamily: 'var(--font-ta16bit), var(--font-mitr)' }}>
          {t('identity')}
        </h1>
        <p className="ppg-card-text">{t('start')}</p>
        <Card heading={t('identity')} body={t('start')} />
        {children}
      </section>
    )
  }

  return (
    <section className="ppg-shell">
      <header
        className="ppg-shell-header"
        style={{
          ...style,
          backgroundColor: 'var(--ppg-bg-surface)',
          color: 'var(--ppg-fg-heading)',
          borderWidth: 'var(--ppg-border-1)',
          borderColor: 'var(--ppg-blue-200)',
          borderStyle: 'solid',
          padding: 'var(--ppg-space-3)',
        }}
      >
        {/** LEFT: the pixel identity + the contextual Course/Module title. */}
        <section className="ppg-shell-identity">
          <h1 className="ppg-heading ppg-heading-text" style={{ fontFamily: 'var(--font-ta16bit), var(--font-mitr)' }}>
            {t('identity')}
          </h1>
          {contextTitle ? <p className="ppg-context-title">{contextTitle}</p> : null}
        </section>
        {/** CENTER: the role-gated primary navigation. */}
        <Nav role={role} />
        {/** RIGHT: language selector + player HUD + logout. */}
        <section className="ppg-shell-hud">
          <LanguageSelector />
          <XPHud />
          <Link className="ppg-nav-item" href="/logout">
            {navT('logout')}
          </Link>
        </section>
      </header>

      {/** The page's own content rides an UNLABELLED section so the page's
       * `<main>` stays the only `main` landmark (axe duplicate-landmark). */}
      <section>{children}</section>

      <footer
        className="ppg-shell-footer"
        style={{
          ...style,
          backgroundColor: 'var(--ppg-bg-body)',
          color: 'var(--ppg-fg-body)',
          padding: 'var(--ppg-space-2) var(--ppg-space-3)',
        }}
      >
        {/** Minimal footer: the exact attribution + its English line + the
         * Health link. No personal / institutional names. */}
        <p className="ppg-card-text">{t('footerAttribution')}</p>
        <p className="ppg-card-text">{t('footerAttributionEn')}</p>
        <p>
          <Link href="/health">{t('footerHealth')}</Link>
        </p>
      </footer>
    </section>
  )
}
