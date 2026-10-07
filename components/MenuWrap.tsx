"use client"

import { useCallback, useState, type ReactNode } from 'react'

/**
 * Ticket #41 stage 2: the mobile collapse affordance — the SAME Shell concept
 * on small screens (the issue: "primary nav collapses into a compact
 * accessible menu; learner status stays visible; no sidebar"). The toggle is
 * a real `button` (native keyboard + the browser's visible focus; the
 * `.ppg-menu-toggle` class rides the focus-ring + reduced-motion rules in
 * `app/globals.css`) with `aria-controls` on the `#ppg-nav-menu` region and
 * `aria-expanded` communicating the collapsed / open state (state never by
 * colour alone — `story #10`: a screen-reader hears the collapsed/expanded
 * state; `story #8`: keyboard-operable, visible focus; reduced-motion safe:
 * the `.ppg-*` classes' `transition/animation-duration: 0s` in the shipped
 * stylesheet keep the menu discrete).
 *
 * The `open` state only flips the wrapper's `.ppg-nav-open` class — the CSS
 * media queries decide what is visible: on mobile the collapsed menu hides
 * the `.ppg-nav-item` links (`display: none`, never Tab-trapable), the open
 * menu shows them; on desktop the toggle is hidden and every item stays
 * visible (the `min-width: 1000px` rules — PPGA #51 moved the tablet
 * breakpoint to the V3 design sheet's boundary). The learner's status (the
 * `XPHud`) is never inside the collapsed content — the HUD stays in the
 * Shell's right cluster on every width (`story #9`: status preserved).
 *
 * PPGA #51: the toggle's FACE moved to the `.ppg-menu-toggle` class in
 * `app/globals.css` (the V3 burger — the inline token style used to override
 * the class); the component carries only behavior + ARIA state.
 */
export interface MenuWrapProps {
  labels: { menuLabel: string; openLabel: string; closeLabel: string }
  /** The id the toggle's `aria-controls` targets (the real Shell uses
   * `ppg-nav-menu`; the gallery demo overrides it so a demo page never
   * duplicates the live nav's id). */
  menuId?: string
  /** The toggle's own id (same reasoning — one id per document). */
  toggleId?: string
  children: ReactNode
}

export function MenuWrap({ labels, menuId = 'ppg-nav-menu', toggleId = 'ppg-menu-toggle', children }: MenuWrapProps) {
  const [open, setOpen] = useState(false)

  const toggleOpen = useCallback(() => setOpen((state) => !state), [])

  return (
    <>
      <button
        // the `.ppg-menu-toggle` class is the focus ring + the reduced-motion
        // target in `app/globals.css`; on desktop the media query hides it.
        className="ppg-menu-toggle"
        type="button"
        id={toggleId}
        aria-controls={menuId}
        aria-expanded={open ? 'true' : 'false'}
        aria-label={open ? labels.closeLabel : labels.menuLabel}
        onClick={toggleOpen}
      >
        ☰
      </button>
      <section className={`ppg-menu-wrap${open ? ' ppg-nav-open' : ''}`}>{children}</section>
    </>
  )
}
