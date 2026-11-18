import { Badge } from './Badge'

/**
 * PPGA #83 UI contract: the research Pre-Test is 50 items, so the submit form
 * needs one answer control PER item: named `item_<n>` (the route's own
 * `item_` filter + the server-side answer key's keys), accepting the shipped
 * `^[A-D]$` letters. The seeded choice rows are now REAL radio controls
 * (one required radiogroup per item); the answer key never reaches the
 * browser, so the choice rows still present their seeded labels while the
 * checked radio carries the submitted key.
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
  /** The id stem: `prettest` keeps the shipped `prettest_answer_item_<n>_<key>`
   * selector; the Final Test passes `posttest` for
   * `posttest_answer_item_<n>_<key>`. */
  answerIdPrefix?: string
}

/**
 * PPGA #84 generalisation: the same per-item control list serves the Final
 * Test. Only the id stem changes (via `answerIdPrefix`); the field names
 * (`item_<n>`), the uppercase A-D values, the group labels and the seeded
 * choice rows stay identical, so the submit route and the server-side key are
 * unchanged.
 *
 * Accessibility: each item is one native `radiogroup` labelled by
 * `answerForQuestion(n)`; the native radios keep arrow-key semantics and the
 * `required` flag, so the browser blocks the single submit until all 50 are
 * answered. The `<label>` wraps the whole row (44px touch target) and the
 * checked/focus treatment lives in `app/globals.css` behind `:has(...)`,
 * never colour alone.
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
        return (
          <div key={item.id} className="ppg-instr-item">
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--ppg-space-2)', flexWrap: 'wrap' }}>
              <Badge text={questionTag(n)} tone="neutral" />
              <Badge text={itemProgress(n, total)} tone="neutral" />
            </div>
            <p className="ppg-sc-question" id={`${answerIdPrefix}_prompt_item_${n}`}>
              {locale === 'th' ? item.th.prompt : item.en.prompt}
            </p>
            <div
              className="ppg-sc-options"
              role="radiogroup"
              aria-label={answerForQuestion(n)}
              aria-describedby={`${answerIdPrefix}_prompt_item_${n}`}
            >
              {Object.entries(choiceSet ?? {}).map(([key, text]) => {
                const value = key.toUpperCase()
                const inputId = `${answerIdPrefix}_answer_item_${n}_${value}`
                return (
                  <label className="ppg-instr-opt" key={key} htmlFor={inputId}>
                    <input
                      className="ppg-sc-opt-radio"
                      type="radio"
                      id={inputId}
                      name={`item_${n}`}
                      value={value}
                      required
                    />
                    <span className="ppg-sc-opt-letter" aria-hidden="true">{value}</span>
                    <span className="ppg-sc-opt-text">{text}</span>
                  </label>
                )
              })}
            </div>
          </div>
        )
      })}
    </div>
  )
}

/** The shipped name (the Pre-Test page and its tests import it). */
export const PreTestItems = InstrumentItems
