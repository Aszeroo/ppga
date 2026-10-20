import { XpRewardChip, type XpRewardChipProps } from './XpRewardChip'
import { Badge } from './Badge'

/**
 * The SelfCheckPanel primitive (#41 stage 4, ticket #10; V3-dressed by
 * ticket #52) — the Lesson-ending Self-Check the SERVER grades: the shipped
 * native retry form (POST `/api/self-check/submit` → `ppg_check_self_check`,
 * the answer key NEVER in the browser, unlimited retries) wearing the
 * gallery's `#s-check` option vocabulary: one question group per
 * `order_index` (the gold numeral tile + the localized stem), then the
 * lettered option rows (`.ppg-sc-opt` + the `.ppg-sc-opt-letter` tile).
 *
 * THE FOUR STATES of the surface (AC #52), each with its own hook:
 * - DEFAULT — a plain `.ppg-sc-opt` row.
 * - SELECTED — `.ppg-sc-opt:has(input:checked)` in `app/globals.css`: the
 *   NATIVE radio stays the entire control (name/value/checked/keyboard all
 *   unchanged — the selection cue is CSS over the radio's own state, no JS,
 *   no data-flow change), so the row tints and the letter tile thickens
 *   while the radio's own `aria-checked` stays the authoritative cue.
 * - CORRECT — the `#s-check-ok` outcome card
 *   (`[data-ppg-sc-result="correct"]`), rendered ONLY when the learner's
 *   REAL `self_check_pass` ledger row exists (the page passes the row); the
 *   mint card carries the shipped copy + the REAL `XpRewardChip` + badge.
 * - WRONG/RETRY — the `#s-check-no` outcome card
 *   (`[data-ppg-sc-result="retry"]`): the encouraging framing (the shipped
 *   "retry freely — no grade is ever recorded" note + 💪), NEVER punitive —
 *   the brief bans XP deduction / punishment language, and nothing on this
 *   card claims a grant that has not landed.
 *
 * WHY the right/wrong is the PANEL's card and not a per-option mark: the
 * answer key is a server secret (the policy denies a client SELECT — the
 * check RPC's sum decides), so no server data could EVER name which option
 * was correct in the browser; the gallery's own idiom agrees (its ok/no
 * screens are whole-panel cards). Marking options per-key would be
 * fabricated data — banned by the real-data rule.
 *
 * The state faces (colours) live ONLY in `app/globals.css` (the purity
 * suite's discipline); the classes are NEW names on purpose — the #51 a11y
 * contrast allowance keys on `ppg-heading`/`ppg-card-text` (locked-card-only
 * in practice), so a wrong-into-allowlist silent pass is impossible here.
 * Pure props (no hooks, no server APIs): the server Lesson page renders the
 * real rows; the component suite renders the same primitive.
 */
export interface SelfCheckRow {
  /** The question number (`order_index`) — the radio name + the tile. */
  orderIndex: number
  /** The option key (`a|b|c|…`) — the radio value + the letter tile. */
  optionKey: string
  /** The localized question stem (the seed repeats it per option row). */
  stem: string
  /** The localized option text. */
  option: string
}

export interface SelfCheckPanelProps {
  lessonKey: string
  /** The see-able option rows in the RPC's own order (grouped here). */
  rows: SelfCheckRow[]
  /** The localized region name (`selfcheck.section`). */
  sectionLabel: string
  /** The localized submit copy (`selfcheck.submitLabel`). */
  submitLabel: string
  /**
   * The SERVER's outcome: `correct` ONLY while the learner's own
   * `self_check_pass` ledger row exists; `retry` frames every other state.
   */
  outcome: 'correct' | 'retry'
  /** The correct card's heading (`selfcheck.passState`). */
  outcomeCopy: string
  /** The retry card's encouraging note (`selfcheck.retryHint`). */
  retryCopy: string
  /** The REAL ledger reward — null renders NO chip (no fake grants). */
  reward?: XpRewardChipProps | null
  /** The localized badge note (`selfcheck.badgeNote`) — null renders none. */
  badgeNote?: string | null
}

/** Group the flat RPC rows by `order_index`, preserving the RPC's order —
 * presentation only: the radio names/values/ids stay exactly what the form
 * always posted. */
function groupRows(rows: SelfCheckRow[]): Array<{ orderIndex: number; stem: string; options: SelfCheckRow[] }> {
  const byIndex = new Map<number, { orderIndex: number; stem: string; options: SelfCheckRow[] }>()
  for (const row of rows) {
    const group = byIndex.get(row.orderIndex)
    if (group) {
      group.options.push(row)
    }
    else {
      byIndex.set(row.orderIndex, { orderIndex: row.orderIndex, stem: row.stem, options: [row] })
    }
  }
  return [...byIndex.values()]
}

export function SelfCheckPanel({
  lessonKey,
  rows,
  sectionLabel,
  submitLabel,
  outcome,
  outcomeCopy,
  retryCopy,
  reward,
  badgeNote,
}: SelfCheckPanelProps) {
  return (
    <section aria-label={sectionLabel} className="ppg-sc-panel">
      <h2 className="ppg-sc-title">{sectionLabel}</h2>
      <form method="POST" action="/api/self-check/submit" data-ppg-self-check-form="selfcheck" aria-label={submitLabel}>
        <input name="lesson_key" defaultValue={lessonKey} hidden={true} />
        {groupRows(rows).map((group) => (
          <div className="ppg-sc-question-group" key={group.orderIndex}>
            <p className="ppg-sc-question">
              <span className="ppg-xp-numeral ppg-stage-numeral" aria-hidden="true">
                {String(group.orderIndex).padStart(2, '0')}
              </span>{' '}
              {group.stem}
            </p>
            <div className="ppg-sc-options">
              {group.options.map((row) => (
                <label
                  className="ppg-sc-opt"
                  key={`${row.orderIndex}-${row.optionKey}`}
                  htmlFor={`answer_${row.orderIndex}_${row.optionKey}`}
                >
                  <input
                    className="ppg-sc-opt-radio"
                    type="radio"
                    id={`answer_${row.orderIndex}_${row.optionKey}`}
                    name={`answer_${row.orderIndex}`}
                    defaultValue={row.optionKey}
                  />
                  <span className="ppg-sc-opt-letter" aria-hidden="true">{row.optionKey.toUpperCase()}</span>
                  <span className="ppg-sc-opt-text">{row.option}</span>
                </label>
              ))}
            </div>
          </div>
        ))}
        <div className="ppg-sc-cta-row">
          <button type="submit" className="ppg-cta" data-ppg-cta="primary">{submitLabel}</button>
        </div>
      </form>
      {outcome === 'correct'
        ? (
          <div className="ppg-sc-result" data-ppg-sc-result="correct">
            <span className="ppg-sc-result-emoji" aria-hidden="true">🎉</span>
            <h3 className="ppg-sc-result-title">{outcomeCopy}</h3>
            <p className="ppg-sc-result-line">
              {reward ? <XpRewardChip {...reward} /> : null}
              {' '}
              {badgeNote ? <Badge text={badgeNote} tone="success" /> : null}
            </p>
          </div>
        )
        : (
          // The encouraging retry — the gallery's `#s-check-no` framing: the
          // note speaks of trying again freely, never of a lost point or a
          // penalty (the brief bans XP deduction / punishment language, and
          // the shipped copy never recorded a grade). The rule note rides it
          // exactly where the shipped page showed it (what a pass brings),
          // stated forward — nothing claims a grant that has not landed.
          <div className="ppg-sc-result" data-ppg-sc-result="retry">
            <span className="ppg-sc-result-emoji" aria-hidden="true">💪</span>
            <p className="ppg-sc-result-note">{retryCopy}</p>
            <p className="ppg-sc-result-line">
              {outcomeCopy}
              {' '}
              {badgeNote ? <Badge text={badgeNote} tone="success" /> : null}
            </p>
          </div>
        )}
    </section>
  )
}
