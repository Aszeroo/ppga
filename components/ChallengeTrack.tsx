import { Link, type AppHref } from '../lib/i18n/routing'
import { type StageState } from '../lib/courseStages'
import { type ChallengeStepKey } from '../lib/challengeStages'
import { stageNodeStyle, stageConnectorStyle, stageChipStyle } from './StageNode'

/**
 * The ChallengeTrack primitive (#41 stage 4, ticket #45) — the module
 * surface's GAME-SEQUENCE road: Lesson → Self-Check → Mission → Result as
 * the SAME stage-map vocabulary #44 shipped: `ol.ppg-stage-map` of
 * `.ppg-stage-item` rows + `.ppg-stage-connector` segments +
 * `.ppg-stage-node`s with numeral / clear-mark / state chip, every state a
 * `data-ppg-stage-state` marker + COPY (never colour-only). The track adds
 * the `data-ppg-challenge-track` marker + the per-step
 * `data-ppg-challenge-step` attribute, and a locked step is the #44 locked
 * semantics verbatim: stripes, `aria-disabled`, COPY and NO link — visible,
 * never hidden, never fake-unlocked.
 *
 * Pure props (no hooks, no server APIs — the primitives' discipline): the
 * server module pages render the real derived steps, the client gallery
 * demos the same primitive; colours resolve `var(--ppg-…)` only.
 *
 * The #52 V3 dressing: the road rides the CSS-owned `.ppg-stage-map` +
 * `.ppg-stage-numeral` (the gold tile is AA at every state incl. locked —
 * no inline override), the node surfaces inherit the shared
 * `stageNodeStyle` (the locked step keeps its STRIPES — `GRADIENT_BY_STATE`
 * is deliberately `undefined` for `locked` so the stripe `background-image`
 * never gets erased), the chips are the gallery pills (`:where` pill radius
 * in globals.css) with the map's own ✓ | ▶️ | 🔒 icon beside the copy.
 */
export interface ChallengeTrackStep {
  key: ChallengeStepKey
  orderIndex: number
  /** The localized step title (`challenge.steps.*`). */
  title: string
  /** The localized state copy (the chip text — the non-colour cue). */
  stateCopy: string
  state: StageState
  /** The route of a step the learner can reach (locked steps have none). */
  href?: AppHref
  /** The sequence's frontier marker (the first OPEN step). */
  isCurrent?: boolean
  /** The localized "current challenge" copy for the frontier chip. */
  currentCopy?: string
}

export interface ChallengeTrackProps {
  steps: ChallengeTrackStep[]
  /** The localized region name (`challenge.trackLabel`). */
  label: string
}

/** The step chip's gallery icon (mirrors `StageNode`'s `STATE_ICON` — the
 * same ✓ | ▶️ | 🔒 decoration beside the COPY; the copy stays the
 * authoritative non-colour cue, so the track may not diverge from the map). */
const STEP_STATE_ICON: Record<StageState, string> = {
  cleared: '✓',
  open: '▶️',
  locked: '🔒',
}

/** The step's chip row: the state chip (the copy cue + the gallery icon) +
 * the frontier chip the current step wears (the pink-accented twin of the
 * stage map's own next-chip). Both ride the pill radius of
 * `:where(.ppg-stage-state-chip, .ppg-stage-next-chip)` in globals.css. */
function StepChips({ step }: { step: ChallengeTrackStep }) {
  const currentChip =
    step.isCurrent && step.currentCopy
      ? {
        ...stageChipStyle(step.state),
        marginInlineStart: 'var(--ppg-space-2)',
        borderColor: 'var(--ppg-pink-accent)',
      }
      : null
  return (
    <>
      <span
        className="ppg-stage-state-chip"
        data-ppg-stage-state={step.state}
        style={stageChipStyle(step.state)}
      >
        <span aria-hidden="true">{`${STEP_STATE_ICON[step.state]} `}</span>
        {step.stateCopy}
      </span>
      {currentChip ? (
        <span
          className="ppg-stage-next-chip"
          data-ppg-stage-chip="current"
          style={currentChip}
        >
          {step.currentCopy}
        </span>
      ) : null}
    </>
  )
}

/** One road node: numeral + cleared mark + (linked or plain) title + the
 * chip row; the locked step wears the #44 locked semantics verbatim
 * (stripes, `aria-disabled`, COPY, NO link). */
function StepNode({ step }: { step: ChallengeTrackStep }) {
  const locked = step.state === 'locked'
  return (
    <section
      role="group"
      className={locked ? 'ppg-stage-node ppg-state-locked' : 'ppg-stage-node'}
      data-ppg-challenge-step={step.key}
      data-ppg-stage-state={step.state}
      data-ppg-stage-current={step.isCurrent ? 'true' : undefined}
      aria-disabled={locked ? 'true' : undefined}
      aria-label={`${step.stateCopy} — ${step.title}`}
      style={stageNodeStyle(step.state)}
    >
      {/* The gold numeral tile (`.ppg-stage-numeral` in globals.css) keeps
          ink-on-cream AA at EVERY state incl. locked — no inline override
          (the #52 tile is CSS-owned). */}
      <span className="ppg-xp-numeral ppg-stage-numeral">
        {String(step.orderIndex).padStart(2, '0')}
      </span>
      {step.state === 'cleared' ? (
        <span
          className="ppg-stage-clear-mark"
          aria-hidden="true"
          style={{ color: 'var(--ppg-status-success)' }}
        >
          ✓
        </span>
      ) : null}
      <span className="ppg-heading ppg-heading-text" style={{ display: 'block' }}>
        {step.href ? (
          <Link
            href={step.href}
            className="ppg-stage-link"
            style={{ color: 'var(--ppg-fg-heading)', textDecoration: 'none' }}
          >
            {step.title}
          </Link>
        ) : (
          step.title
        )}
      </span>
      <StepChips step={step} />
    </section>
  )
}

export function ChallengeTrack({ steps, label }: ChallengeTrackProps) {
  return (
    <ol
      className="ppg-stage-map ppg-challenge-track"
      data-ppg-challenge-track="true"
      aria-label={label}
    >
      {steps.map((step, index) => (
        <li className="ppg-stage-item" key={step.key}>
          {index === 0 ? null : (
            <span
              className="ppg-stage-connector"
              aria-hidden="true"
              style={stageConnectorStyle(step.state)}
            />
          )}
          <StepNode step={step} />
        </li>
      ))}
    </ol>
  )
}
