'use client'

import { useEffect, useId, useRef, useState } from 'react'

import { Link } from '../lib/i18n/routing'
import { type MissionUnlockInfo } from './MissionPanel'
import { type XpRewardChipProps } from './XpRewardChip'

/**
 * The reward-moment celebration popup (#53, V3 reskin stage 3): the gallery's
 * `#s-clear` win card (the white `clear-card` + success border + gold ring +
 * confetti + the 🎉 mega-tile + the reward panel) re-cut as a DISMISSABLE
 * dialog over the REAL server data the page already renders. It carries three
 * optional sections, each keyed off a server truth the page READ (never a
 * client-invented event):
 *
 * - XP GRANT — the page's real ledger row (`self_check_pass:…`,
 *   `knowledge_mission_pass:…`, `practical_approval:…`, `final_project:…`):
 *   the amount is the row's own `amount`, the identity its own PK marker.
 *   The panel's `success | clear` framing IS the server's fresh-grant truth;
 *   the popup celebrates that same row once per browser (see the memory
 *   keys below — dispatch-A's one-shot moment, made revisit-stable).
 * - LEVEL UP — the dashboard's REAL derived level (`floor(total/100)+1` off
 *   the ledger SUM). A popup only celebrates an INCREASE the browser
 *   actually witnessed: the first observed level is recorded as a baseline,
 *   never celebrated (no fabricated transition).
 * - MODULE UNLOCK — the map read's next-module `open` (the SAME
 *   `buildUnlockBand` data the unlock band renders — copy, real title, real
 *   href).
 *
 * EXACTLY-ONCE without server logic: each section's identity (the ledger PK,
 * the unlocked module key, the level number) is recorded in this browser's
 * localStorage the moment it is celebrated, and never celebrated again here.
 * The trigger is the real row; the once-per-browser memory is client-side
 * bookkeeping only — a re-visit never re-fires, a fresh browser sees each
 * real moment once, and the DATA is always the server's read (shared-browser
 * caveat: two learners on one browser share the memory — the worst case is a
 * missed re-show, never a fabricated grant).
 *
 * Gates it must not break (all honoured): the card carries NO `.ppg-cta`
 * (the close is `.ppg-btn-secondary`, the module link `.ppg-link` — the
 * page's one primary CTA stays the page's own), NO success-tone StatusPill
 * (the journey's count-0 gates stay structural-zero), NO duplicate
 * `data-ppg-xp-event` / `data-ppg-unlock` / `data-ppg-badge` markers (the
 * popup carries its own `data-ppg-celebration*` seams). Keyboard: Escape
 * dismisses anywhere, the close button dismisses, focus moves into the
 * dialog on open and is restored on close. Motion: the pop-in + confetti
 * are CSS-only and the stylesheet zeroes them under `prefers-reduced-motion`
 * (globals.css `#s-clear` block). Presentation only — no reads, no routes,
 * no grants: every value is a prop the SERVER already read.
 */
export interface RewardCelebrationCopy {
  /** The dialog heading (`reward.title` — gallery `#s-clear` verbatim). */
  title: string
  /** The dismiss action (`reward.dismiss`). */
  dismiss: string
  /** The level word (`header.level`) for the level-up section. Only the
   * dashboard ever renders that section (it is the only page that READS the
   * derived level) — the surfaces without a level read simply omit it. */
  levelLabel?: string
}

export interface RewardCelebrationProps {
  /** The REAL ledger grant this page renders (null/omitted → no XP section). */
  reward?: XpRewardChipProps | null
  /** The REAL next-module unlock the map read speaks (null → no section). */
  unlocked?: MissionUnlockInfo | null
  /** The REAL derived level (the dashboard home; null → no section). */
  level?: number | null
  copy: RewardCelebrationCopy
}

/** One-shot memory keys: the celebrated identities are the SERVER's own
 * (the ledger PK, the unlocked module key, the level number). */
const XP_KEY = (eventAttr: string) => `ppg-celebrated:xp:${eventAttr}`
const UNLOCK_KEY = (moduleKey: string) => `ppg-celebrated:unlock:${moduleKey}`
const LEVEL_KEY = 'ppg-celebrated:level'

/** Storage-safe reads (private-mode throws degrade to "celebrate once per
 * page view" — still never a fabricated event, still the server's data). */
function storageGet(key: string): string | null {
  try {
    return window.localStorage.getItem(key)
  } catch {
    return null
  }
}
function storageSet(key: string, value: string): void {
  try {
    window.localStorage.setItem(key, value)
  } catch {
    /* best-effort memory */
  }
}

/** The unlocked module's identity (the band's own href carries the key). */
function unlockedKey(unlocked: MissionUnlockInfo): string {
  const params = (unlocked.href as { params?: { moduleKey?: string } }).params
  return params?.moduleKey ?? unlocked.title
}

interface Sections {
  xp: boolean
  unlock: boolean
  level: boolean
}
const NO_SECTIONS: Sections = { xp: false, unlock: false, level: false }

export function RewardCelebration({ reward, unlocked, level, copy }: RewardCelebrationProps) {
  const titleId = useId()
  const [sections, setSections] = useState<Sections>(NO_SECTIONS)
  const decided = useRef(false)
  const cardRef = useRef<HTMLDivElement | null>(null)
  const restoreRef = useRef<Element | null>(null)

  // Decide ONCE per mount (the `decided` ref keeps StrictMode's double
  // effect from re-suppressing a section it just celebrated).
  useEffect(() => {
    if (decided.current) return
    decided.current = true
    const xp = !!reward && !storageGet(XP_KEY(reward.eventAttr))
    const unlock = !!unlocked && !storageGet(UNLOCK_KEY(unlockedKey(unlocked)))
    // The level baseline: the FIRST observed level is recorded, never
    // celebrated (an ABSENT memory is NOT zero — `Number(null)` coerces to
    // 0, which would celebrate a fabricated 0->N transition on a learner's
    // first-ever view; only a WITNESSED increase above the baseline fires).
    let levelUp = false
    if (typeof level === 'number') {
      const stored = storageGet(LEVEL_KEY)
      const seen = stored !== null ? Number(stored) : null
      levelUp =
        seen !== null && Number.isFinite(seen) && level > seen
    }
    // The celebration is recorded at the moment it SHOWS (exactly once).
    if (xp && reward) storageSet(XP_KEY(reward.eventAttr), String(reward.amount))
    if (unlock && unlocked) storageSet(UNLOCK_KEY(unlockedKey(unlocked)), '1')
    if (typeof level === 'number') storageSet(LEVEL_KEY, String(level))
    if (!xp && !unlock && !levelUp) return
    setSections({ xp: !!xp, unlock: !!unlock, level: levelUp })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const open = sections.xp || sections.unlock || sections.level

  /** Dismiss: hide + restore the focus the dialog took. */
  function dismiss() {
    setSections(NO_SECTIONS)
    const el = restoreRef.current
    if (el instanceof HTMLElement && document.contains(el)) el.focus()
    restoreRef.current = null
  }

  // Focus in on open, restore on dismiss (a dialog that steals focus gives
  // it back; then the page's own focus order stays exactly as it was).
  useEffect(() => {
    if (!open) return
    restoreRef.current = document.activeElement
    cardRef.current?.focus()
    // Escape dismisses — anywhere, no focus prerequisite (the AC's
    // keyboard-dismissable). Tab is NOT trapped: the suites (and screen
    // readers on a non-blocking scrim) keep reaching the page behind.
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') dismiss()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [open])

  if (!open) return null

  // The marker names the lead moment (xp first — the popup's headline act).
  const kind = sections.xp ? 'xp' : sections.unlock ? 'unlock' : 'level'

  return (
    <div className="ppg-celebration" role="presentation">
      {/* The gallery's confetti: decoration only, and CSS zeroes its fall
          under reduced motion (it never carries copy or state). */}
      <span className="ppg-celebration-confetti" aria-hidden="true">
        <span /><span /><span /><span /><span /><span /><span /><span /><span />
      </span>
      <div
        ref={cardRef}
        role="alertdialog"
        aria-labelledby={titleId}
        tabIndex={-1}
        className="ppg-celebration-card"
        data-ppg-celebration={kind}
      >
        <span className="ppg-celebration-tile" aria-hidden="true">🎉</span>
        <h2 id={titleId} className="ppg-celebration-title">{copy.title}</h2>
        {sections.xp && reward
          ? (
            <p className="ppg-celebration-row" data-ppg-celebration-section="xp">
              <span aria-hidden="true">⭐ </span>
              <span className="ppg-celebration-label">{reward.label}</span>{' '}
              {/* The row's OWN amount — the ledger figure, never a schedule
                  claim. NO data-ppg-xp-event here: that observable stays
                  exactly-one on the page's chip. */}
              <span className="ppg-xp-numeral">+{reward.amount} XP</span>
            </p>
          )
          : null}
        {sections.level && typeof level === 'number'
          ? (
            <p className="ppg-celebration-row" data-ppg-celebration-section="level">
              <span className="ppg-celebration-lv" aria-hidden="true">LV</span>{' '}
              {copy.levelLabel} {level}
            </p>
          )
          : null}
        {sections.unlock && unlocked
          ? (
            <p className="ppg-celebration-row" data-ppg-celebration-section="unlock">
              <span aria-hidden="true">🗺️ </span>
              {unlocked.copy}{' '}
              {/* The text-link face, and NO data-ppg-unlock marker: the
                  band's count-1 gate belongs to the page's band alone. */}
              <Link className="ppg-link" href={unlocked.href}>{unlocked.title}</Link>
            </p>
          )
          : null}
        <button type="button" className="ppg-btn-secondary ppg-celebration-close" onClick={dismiss}>
          {copy.dismiss}
        </button>
      </div>
    </div>
  )
}
