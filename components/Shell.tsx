import 'server-only'

import { getTranslations } from 'next-intl/server'

import { type ReactNode } from 'react'

import { Link } from '../lib/i18n/routing'

import { LanguageSelector } from './LanguageSelector'
import { XPHud } from './XPHud'
import { Nav } from './Nav'

/**
 * Ticket #51: the persistent V3 frame — the one reusable Shell the locale
 * layout carries on EVERY authenticated surface, restyled to the owner's V3
 * design gallery (`UI_UX_design/index.html`, the `.hd`/`.navs`/`.hright`/`.ft`
 * sections): white header + 6px pink underline + the rainbow strip beneath it,
 * the pixel `PPGA` logo (display font, blue/purple shadow), the CENTERED
 * role-gated nav pills with the active-section indication (`aria-current` +
 * the gradient pill — state never by colour alone), the gold XP chip + the LV
 * chip (the real `ppg_xp_summary` read — no fabricated numbers), the user chip
 * (role-appropriate label, the gallery's verbatim copy), the compact language
 * switcher and the logout chip, all in the gallery's `.hright` cluster; the
 * simple white footer naming the course + audience under its strip. Mobile
 * (the V3 tablet breakpoint <1000px): the nav collapses behind the menu
 * button, the HUD cluster stays visible.
 *
 * Login/logout render STANDALONE outside the frame as the V3 title screens —
 * the gallery's login-card idiom (6px pink card + `::before` strip + bouncing
 * mascot + the pixel wordmark), the page's own form/button riding the children,
 * and the compact switcher on the card (`expectStandaloneScreen`'s landmark
 * proof: no `navigation` landmark named `shell.navLabel`, no `contentinfo`).
 *
 * Composition is the design's; the BEHAVIOUR is unchanged: the role→nav-items
 * mapping (`Nav`), the locale routing (`LanguageSelector`), the XP read
 * (`XPHud`) and every route the layout feeds stay as #41 shipped them.
 *
 * Accessibility preserved from the #18/#41/#46 sweeps: `header`/`nav`/`footer`
 * landmarks with the same ARIA names (`shell.navLabel`), the children ride an
 * UNLABELLED `section` (no duplicate `main` landmark), the focus rings ride
 * the `.ppg-nav-item`/`.ppg-menu-toggle`/`.ppg-cta` rules in
 * `app/globals.css`, reduced-motion zeroes every V3 animation, and state is
 * never colour-only (`aria-current`, `aria-expanded`, the progress text).
 *
 * Tokens/pixels: the V3 frame classes live in `app/globals.css` (literal
 * colours only there — the component-purity suite scans `components/*`);
 * nothing here carries a hex or a hard colour.
 */
export interface ShellProps {
  /** The session/profile role (the issue's role→nav-items mapping is
   * server-derived; hiding is not the security mechanism — RLS stays
   * authoritative at the row level). A caller with no role sees NO nav. */
  role?: 'learner' | 'teacher' | 'admin'
  /** The contextual Course/Module title (where appropriate — the layout
   * derives it from the pathname over the existing `course.*` copy). */
  contextTitle?: string | null
  /** Login/logout render standalone as the V3 title screens — the Shell
   * returns the login-card screen (identity + `shell.start` + the children +
   * the switcher), never the HUD bar / nav / footer. */
  standalone?: boolean
  /** The pathname AFTER the locale prefix (`''`, `course`,
   * `course/module-01`, …) the layout read off `x-ppga-path` — the ACTIVE
   * nav item derives from it (the gallery's `.nl.on`); never a security
   * decision, only the visual current-page state. */
  activeSection?: string
  children: ReactNode
}

/** The user chip's icon per role (the gallery's uchip icons). */
const ROLE_ICON: Record<'learner' | 'teacher' | 'admin', string> = {
  learner: '🎓',
  teacher: '🧑‍🏫',
  admin: '🛡️',
}

/** The user chip's copy key per role (the gallery's verbatim role labels). */
const ROLE_COPY: Record<'learner' | 'teacher' | 'admin', 'userLearner' | 'userTeacher' | 'userAdmin'> = {
  learner: 'userLearner',
  teacher: 'userTeacher',
  admin: 'userAdmin',
}

export async function Shell({ role, contextTitle, standalone, activeSection, children }: ShellProps) {
  const t = await getTranslations('shell')
  const navT = await getTranslations('nav')

  /** The V3 title screen — the login/logout frame OUTSIDE the app frame. */
  if (standalone) {
    return (
      <section
        className="ppg-login-card ppg-strip-top"
        data-ppg-standalone="true"
        aria-label={`${t('identity')} — ${t('start')}`}
      >
        <div className="ppg-mascot" aria-hidden="true">
          🎓
        </div>
        <h1 className="ppg-title-h1" style={{ textAlign: 'center' }}>
          {t('logo')}
        </h1>
        <p className="ppg-title-sub" style={{ textAlign: 'center' }}>
          {t('identity')}
        </p>
        <p className="ppg-title-sub" style={{ textAlign: 'center' }}>
          {t('start')}
        </p>
        {children}
        {/** The compact switcher rides the card — the language choice works
         * from the title screens too (AC: any page). Its `nav` landmark is
         * named `selector.label`, never the frame's `shell.navLabel`. */}
        <LanguageSelector />
      </section>
    )
  }

  return (
    <section>
      <header className="ppg-shell-header ppg-strip-bottom">
        <div className="ppg-shell-in">
          {/** LEFT: the pixel identity + the contextual Course/Module title. */}
          <span className="ppg-logo">{t('logo')}</span>
          {contextTitle ? <p className="ppg-context-title">{contextTitle}</p> : null}
          {/** CENTER: the role-gated primary navigation (active section on). */}
          <Nav role={role} activeSection={activeSection} />
          {/** RIGHT (the gallery's `.hright`): XP + Level chips (the REAL
           * `ppg_xp_summary` read), the user chip, the compact switcher and
           * the logout chip. */}
          <div className="ppg-hud-cluster">
            <XPHud />
            {role ? (
              <span className="ppg-user-chip">
                <span aria-hidden="true">{ROLE_ICON[role]}</span> {t(ROLE_COPY[role])}
              </span>
            ) : null}
            <LanguageSelector />
            <Link className="ppg-nav-item ppg-logout-chip" href="/logout">
              {navT('logout')}
            </Link>
          </div>
        </div>
      </header>

      {/** The page's own content rides an UNLABELLED section so the page's
       * `<main>` stays the only `main` landmark (axe duplicate-landmark). */}
      <section>{children}</section>

      {/** Simple footer: the gallery's `.ft` — white panel (`ppg-shell-footer`)
       * with the rainbow strip riding its top edge (`ppg-strip-top`) + ONE copy
       * line naming the course + the audience (`shell.footerAttribution`, the
       * design gallery's verbatim Thai + English). */}
      <footer className="ppg-shell-footer ppg-strip-top">
        <p className="ppg-footer-copy">{t('footerAttribution')}</p>
      </footer>
    </section>
  )
}
