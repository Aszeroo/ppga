import { type CSSProperties } from 'react'

import { Link, type AppHref } from '../lib/i18n/routing'
import { type StageState } from '../lib/courseStages'

/**
 * The StageNode primitive (#41 stage 3, ticket #44) — one Module on the
 * Course Map's pixel stage road: the numeral badge, the title, the summary
 * and the state chip (`cleared | open | locked`). The vocabulary is the
 * shared stage-map language ticket #45 reuses: `.ppg-stage-item` (the row),
 * `.ppg-stage-connector` (the road segment), `.ppg-stage-node`,
 * `.ppg-stage-numeral`, `.ppg-stage-clear-mark`, `.ppg-stage-state-chip` +
 * the `data-ppg-stage-state` / `data-ppg-stage-current` markers.
 *
 * State is NEVER colour-only: every node carries its state COPY in the chip
 * + in the `aria-label`; a locked node is also `aria-disabled`, wears the
 * shipped `.ppg-state-locked` stripes and is rendered WITHOUT a link —
 * visible and semantically locked, never hidden, never fake-unlocked. A
 * cleared/open node links its title (keyboard-operable `.ppg-stage-link`,
 * the token focus ring via `app/globals.css`).
 *
 * Tokens only (the primitives' discipline): every colour resolves a
 * `var(--ppg-…)`. No hooks and no server APIs: the pure function renders in
 * the server Course page AND in the client gallery demo.
 */
export interface StageNodeProps {
  moduleKey: string
  orderIndex: number
  title: string
  summary: string
  state: StageState
  /** The localized state copy (the chip text — the non-colour cue). */
  stateCopy: string
  /** The real next-stage direction marker (the map's frontier node). */
  isNext?: boolean
  /** The localized "next stage" copy shown on the frontier chip. */
  nextCopy?: string
  /** The module route — set for cleared/open; a locked node has none. */
  href?: AppHref
  /** The first node skips the connector (nothing precedes it). */
  isFirst?: boolean
}

const BORDER_BY_STATE: Record<StageState, string> = {
  cleared: 'var(--ppg-status-success)',
  open: 'var(--ppg-pink-accent)',
  locked: 'var(--ppg-status-locked)',
}

const BG_BY_STATE: Record<StageState, string> = {
  cleared: 'var(--ppg-bg-surface)',
  open: 'var(--ppg-state-available-bg)',
  locked: 'var(--ppg-state-locked-bg)',
}

const CONNECTOR_BY_STATE: Record<StageState, string> = {
  cleared: 'var(--ppg-status-success)',
  open: 'var(--ppg-pink-accent)',
  locked: 'var(--ppg-status-locked)',
}

export function StageNode({
  moduleKey,
  orderIndex,
  title,
  summary,
  state,
  stateCopy,
  isNext = false,
  nextCopy,
  href,
  isFirst = false,
}: StageNodeProps) {
  const locked = state === 'locked'

  const nodeStyle: CSSProperties = {
    backgroundColor: BG_BY_STATE[state],
    color: locked ? 'var(--ppg-state-locked-fg)' : 'var(--ppg-fg-heading)',
    borderWidth: 'var(--ppg-border-2)',
    borderColor: BORDER_BY_STATE[state],
    borderStyle: 'solid',
    boxShadow: locked ? 'none' : 'var(--ppg-shadow-pixel-2)',
    padding: 'var(--ppg-space-3)',
  }

  const chipStyle: CSSProperties = {
    display: 'inline-block',
    fontFamily: 'var(--font-ta16bit), var(--font-mitr)',
    fontSize: '0.8rem',
    backgroundColor: 'var(--ppg-blue-100)',
    color: 'var(--ppg-fg-heading)',
    borderWidth: 'var(--ppg-border-1)',
    borderColor: BORDER_BY_STATE[state],
    borderStyle: 'solid',
    boxShadow: 'var(--ppg-shadow-pixel-1)',
    padding: 'var(--ppg-space-1) var(--ppg-space-2)',
  }

  return (
    <li className="ppg-stage-item">
      {isFirst ? null : (
        <span
          className="ppg-stage-connector"
          aria-hidden="true"
          style={{
            display: 'block',
            width: 'var(--ppg-border-3)',
            height: 'var(--ppg-space-4)',
            marginLeft: 'var(--ppg-space-3)',
            backgroundColor: CONNECTOR_BY_STATE[state],
          }}
        />
      )}
      <section
        role="group"
        className={locked ? 'ppg-stage-node ppg-state-locked' : 'ppg-stage-node'}
        data-ppg-stage-module={moduleKey}
        data-ppg-stage-state={state}
        data-ppg-stage-current={isNext ? 'true' : undefined}
        aria-disabled={locked ? 'true' : undefined}
        aria-label={`${stateCopy} — ${title}`}
        style={nodeStyle}
      >
        <span
          className="ppg-xp-numeral ppg-stage-numeral"
          style={{ color: locked ? 'var(--ppg-state-locked-fg)' : 'var(--ppg-fg-heading)' }}
        >
          {String(orderIndex).padStart(2, '0')}
        </span>
        {state === 'cleared' ? (
          <span
            className="ppg-stage-clear-mark"
            aria-hidden="true"
            style={{ color: 'var(--ppg-status-success)' }}
          >
            ✓
          </span>
        ) : null}
        <h2 className="ppg-heading ppg-heading-text">
          {href ? (
            <Link
              href={href}
              className="ppg-stage-link"
              style={{ color: 'var(--ppg-fg-heading)', textDecoration: 'none' }}
            >
              {title}
            </Link>
          ) : (
            title
          )}
        </h2>
        <p className="ppg-card-text">{summary}</p>
        <span className="ppg-stage-state-chip" data-ppg-stage-state={state} style={chipStyle}>
          {stateCopy}
        </span>
        {isNext && nextCopy ? (
          <span
            className="ppg-stage-next-chip"
            data-ppg-stage-chip="current"
            style={{
              ...chipStyle,
              marginInlineStart: 'var(--ppg-space-2)',
              borderColor: 'var(--ppg-pink-accent)',
            }}
          >
            {nextCopy}
          </span>
        ) : null}
      </section>
    </li>
  )
}
