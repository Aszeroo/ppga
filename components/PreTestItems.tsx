import { Badge } from './Badge'

/**
 * PPGA #83 UI contract: the research Pre-Test is 50 items, so the submit form
 * needs one answer control PER item — named `item_<n>` (the route's own
 * `item_` filter + the server-side answer key's keys), accepting the shipped
 * `^[A-D]$` letters. The seeded choice tiles stay presentational (the answer
 * key never reaches the browser); the compact text input is the control.
 *
 * Kept out of the async page so the control contract is renderable in the
 * component tests: the page passes the localized labels in, the form wraps
 * this list, and every control therefore rides the submitted form.
 */
export interface PreTestItem {
  id: string
  th: { prompt: string; choices: Record<string, string> }
  en: { prompt: string; choices: Record<string, string> }
}

export interface InstrumentItemsProps {
  items: PreTestItem[]
  locale: string
  questionTag: (n: number) => string
  itemProgress: (n: number, total: number) => string
  answerForQuestion: (n: number) => string
  /** The id stem: `prettest` keeps the shipped `#prettest_answer_item_<n>`
   * selector; the Final Test passes `posttest` for `#posttest_answer_item_<n>`. */
  answerIdPrefix?: string
}

/**
 * PPGA #84 generalisation: the same per-item control list serves the Final
 * Test. Only the id stem changes (via `answerIdPrefix`); the field names
 * (`item_<n>`), the A-D pattern, the labels and the seeded choice tiles stay
 * identical, so the submit route and the server-side key are unchanged.
 */
export function InstrumentItems({
  items,
  locale,
  questionTag,
  itemProgress,
  answerForQuestion,
  answerIdPrefix = 'prettest',
}: InstrumentItemsProps) {
  const total = items.length
  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ppg-space-3)' }}>
      {items.map((item, i) => {
        const n = i + 1
        const choiceSet = locale === 'th' ? item.th.choices : item.en.choices
        const inputId = `${answerIdPrefix}_answer_item_${n}`
        return (
          <div key={item.id} className="ppg-instr-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--ppg-space-2)', flexWrap: 'wrap' }}>
              <Badge text={questionTag(n)} tone="neutral" />
              <Badge text={itemProgress(n, total)} tone="neutral" />
            </div>
            <p className="ppg-sc-question">{item.th.prompt}</p>
            <p className="ppg-card-text">{item.en.prompt}</p>
            <div className="ppg-sc-options">
              {Object.entries(choiceSet ?? {}).map(([letter, text]) => (
                <div key={letter} className="ppg-instr-opt">
                  <span className="ppg-sc-opt-letter" aria-hidden="true">{letter}</span>
                  <span className="ppg-sc-opt-text">{text}</span>
                </div>
              ))}
            </div>
            <div>
              <label className="ppg-field-label" htmlFor={inputId}>
                {answerForQuestion(n)}
              </label>
              <input
                className="ppg-input"
                id={inputId}
                name={`item_${n}`}
                required
                pattern="^[A-D]$"
              />
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The shipped name (the Pre-Test page and its tests import it). */
export const PreTestItems = InstrumentItems

