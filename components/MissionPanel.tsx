import { type ReactNode } from 'react'

import { Link, type AppHref } from '../lib/i18n/routing'
import { type MissionPanelState } from '../lib/challengeStages'
import { stageChipStyle } from './StageNode'
import { XpRewardChip, type XpRewardChipProps } from './XpRewardChip'

/**
 * The MissionPanel primitive (#41 stage 4, ticket #45; V3 panel face for
 * #53) — the mission attempt's panel with its `challenge | success | clear`
 * framing state, dressed in the gallery's big mission-card face
 * (`#s-mission`: the thick-bordered card + the 🎯 icon tile + the heading;
 * a CLEARED panel reads like the `#s-clear` stage win — the 🎉 rides the
 * state chip BESIDE the copy). The state colors live in
 * `app/globals.css `.ppg-mission-panel[data-ppg-mission-panel=…]` (token
 * gradients mirroring the stage road's own open/cleared surfaces — NO
 * second gradient inline, the #52 landmine), and the state stays copy +
 * the `data-ppg-mission-panel` / `data-ppg-mission-state` markers + the
 * chip icon, never colour-only. The panel optionally carries the REAL XP
 * reward chip (a ledger row — see `XpRewardChip`) and the unlock band (the
 * DATABASE's own next-module `open` — `data-ppg-unlock="next-module"`,
 * rendered ONLY when a real completion actually opened the next module).
 *
 * Presentation only: the panel wraps the shipped form + history; every
 * transition still belongs to the SERVER's RPCs. Pure props (no hooks, no
 * server APIs); colours are the stylesheet's, so this file carries none.
 */
export interface MissionUnlockInfo {
  /** The localized band lead-in (`challenge.unlockNext`). */
  copy: string
  /** The unlocked module's title. */
  title: string
  href: AppHref
}

export interface MissionPanelProps {
  state: MissionPanelState
  /** The localized panel-state copy (the chip text — the non-colour cue). */
  stateCopy: string
  /** The panel heading (the mission's own section title). */
  heading: string
  /** The localized region name. */
  panelLabel: string
  /** The REAL ledger reward (null/omitted renders NO reward — no fake grants). */
  reward?: XpRewardChipProps | null
  /** The REAL unlock (null/omitted renders NO band). */
  unlocked?: MissionUnlockInfo | null
  children: ReactNode
}

export function MissionPanel({
  state,
  stateCopy,
  heading,
  panelLabel,
  reward,
  unlocked,
  children,
}: MissionPanelProps) {
  // success + clear share the cleared-green chip face; the challenge keeps
  // the open-pink frontier chip (the stage-map vocabulary's own colours,
  // `stageChipStyle` — the panel's SURFACE is the stylesheet's face).
  const nodeState = state === 'challenge' ? 'open' : 'cleared'
  return (
    <section
      aria-label={panelLabel}
      className="ppg-mission-panel"
      data-ppg-mission-panel={state}
    >
      <div className="ppg-mission-head">
        <span className="ppg-mission-tile" aria-hidden="true">🎯</span>
        <h2 className="ppg-heading ppg-heading-text">{heading}</h2>
        <span
          className="ppg-stage-state-chip"
          data-ppg-mission-state={state}
          style={stageChipStyle(nodeState)}
        >
          {stateCopy}
          {/* The stage-win flourish rides the chip of a panel the SERVER
              says is won — copy + icon + marker, never hue alone; the 🎉
              is the gallery's own `#s-clear` mega-icon. */}
          {state === 'challenge' ? null : <span aria-hidden="true"> 🎉</span>}
        </span>
      </div>
      {reward ? (
        <>
          {' '}
          <XpRewardChip {...reward} />
        </>
      ) : null}
      {unlocked ? (
        <p data-ppg-unlock="next-module">
          {unlocked.copy}{' '}
          {/* The text-link face (#52): the band is content, not a competing
              CTA — the panel keeps exactly one primary action (its form). */}
          <Link href={unlocked.href} className="ppg-link">
            {unlocked.title}
          </Link>
        </p>
      ) : null}
      {children}
    </section>
  )
}
