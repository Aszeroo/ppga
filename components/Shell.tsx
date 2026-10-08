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
 * the gallery's `#s-login` decorated stage (the pastel `bg-a` gradient + the
 * floating `.deco` clouds/sparkles/squares, all `aria-hidden`), the page's
 * own `.ppg-login-card` riding as the centred child (mascot + pixel wordmark
 * + copy + form + the language switch ON the card, rendered by the page's
 * `LanguageSelectorPill` — its `nav` landmark is named `selector.label`,
 * never the frame's `shell.navLabel`). `expectStandaloneScreen`'s landmark
 * proof: no `navigation` landmark named `shell.navLabel`, no `contentinfo`,
 * and no mobile menu toggle (it lives inside the framed header's `Nav`).
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
   * returns the decorated `#s-login` stage with the page's own card as its
   * centred child, never the HUD bar / nav / footer. */
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

/** The design's `#s-login` floating decoration (the gallery's `.deco`
 * clouds/star8-squares, positions/delays verbatim). Colour + animation ride
 * the `.ppg-deco-*` classes in `app/globals.css` (the token-purity
 * discipline — this file carries NO colour); the inline styles here are pure
 * geometry (percent positions, the one 20px sparkle). All aria-hidden: the
 * stage is decoration, never content. */
const TITLE_DECO = [
  { className: 'ppg-deco ppg-deco-cloud', style: { top: '12%', left: '6%' } },
  { className: 'ppg-deco ppg-deco-cloud', style: { top: '22%', right: '7%', animationDelay: '2s' } },
  { className: 'ppg-deco ppg-deco-star8', style: { top: '16%', left: '16%' } },
  { className: 'ppg-deco ppg-deco-star8', style: { bottom: '18%', right: '11%', animationDelay: '1.2s' } },
  { className: 'ppg-deco ppg-deco-star8', style: { top: '60%', left: '9%', animationDelay: '2.4s', width: '20px', height: '20px' } },
  { className: 'ppg-deco ppg-deco-sq', style: { top: '30%', right: '20%', animationDelay: '.6s' } },
  { className: 'ppg-deco ppg-deco-sq ppg-deco-sq-purple', style: { bottom: '26%', left: '18%', animationDelay: '1.4s' } },
  { className: 'ppg-deco ppg-deco-sq ppg-deco-sq-blue', style: { top: '70%', right: '28%', animationDelay: '2s' } },
] as const

export async function Shell({ role, contextTitle, standalone, activeSection, children }: ShellProps) {
  const t = await getTranslations('shell')
  const navT = await getTranslations('nav')

  /**
   * PPGA #49 (owner preview review): the standalone title screens are the
   * design's `#s-login` STAGE — the full-viewport pastel background + the
   * floating decoration — and the page's own card rides as the centred
   * child (login/logout render their design cards: mascot + pixel wordmark +
   * copy + form + the language switch ON the card). NO header, NO nav, NO
   * rainbow strips, NO footer here — the landmark proof holds: the Shell's
   * `shell.navLabel` nav and its `contentinfo` never render standalone, and
   * the mobile menu toggle (the `☰` button inside `Nav`) is part of the
   * framed header, so it can never float over a title screen.
   */
  if (standalone) {
    return (
      <div className="ppg-login-stage" data-ppg-standalone="true">
        {TITLE_DECO.map((deco, i) => (
          <span key={i} className={deco.className} style={deco.style} aria-hidden="true" />
        ))}
        {children}
      </div>
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
