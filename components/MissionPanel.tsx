import { type ReactNode } from 'react'

import { Link, type AppHref } from '../lib/i18n/routing'
import { type MissionPanelState } from '../lib/challengeStages'
import { stageNodeStyle, stageChipStyle } from './StageNode'
import { XpRewardChip, type XpRewardChipProps } from './XpRewardChip'

/**
 * The MissionPanel primitive (#41 stage 4, ticket #45) — the mission
 * attempt's panel with its `challenge | success | clear` framing state on
 * the stage-map vocabulary: the panel wears the stage node's pixel surface
 * (`stageNodeStyle` — challenge reads OPEN-pink, a real grant SUCCESS-green,
 * a completion CLEAR-green) + the state CHIP with its COPY + the
 * `data-ppg-mission-panel` / `data-ppg-mission-state` markers (state never
 * colour-only). The panel optionally carries the REAL XP reward chip (a
 * ledger row — see `XpRewardChip`) and the unlock band (the DATABASE's own
 * next-module `open` — `data-ppg-unlock="next-module"`, rendered ONLY when a
 * real completion actually opened the next module).
 *
 * Presentation only: the panel wraps the shipped form + history; every
 * transition still belongs to the SERVER's RPCs. Pure props (no hooks, no
 * server APIs): server pages + the client gallery render the same primitive;
 * colours resolve `var(--ppg-…)` only.
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
  // success + clear share the cleared-green road surface; the challenge keeps
  // the open-pink frontier face (the stage-map vocabulary's own colours).
  const nodeState = state === 'challenge' ? 'open' : 'cleared'
  return (
    <section
      aria-label={panelLabel}
      data-ppg-mission-panel={state}
      style={stageNodeStyle(nodeState)}
    >
      <h2 className="ppg-heading ppg-heading-text">{heading}</h2>
      <span
        className="ppg-stage-state-chip"
        data-ppg-mission-state={state}
        style={stageChipStyle(nodeState)}
      >
        {stateCopy}
      </span>
      {reward ? (
        <>
          {' '}
          <XpRewardChip {...reward} />
        </>
      ) : null}
      {unlocked ? (
        <p data-ppg-unlock="next-module">
          {unlocked.copy}{' '}
          <Link
            href={unlocked.href}
            className="ppg-button"
            style={{ display: 'inline-block', fontFamily: 'var(--font-ppg-display), var(--font-ppg-body)' }}
          >
            {unlocked.title}
          </Link>
        </p>
      ) : null}
      {children}
    </section>
  )
}
