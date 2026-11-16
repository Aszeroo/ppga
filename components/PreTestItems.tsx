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

export interface PreTestItemsProps {
  items: PreTestItem[]
  locale: string
  questionTag: (n: number) => string
  itemProgress: (n: number, total: number) => string
  answerForQuestion: (n: number) => string
}

export function PreTestItems({
  items,
  locale,
  questionTag,
  itemProgress,
  answerForQuestion,
}: PreTestItemsProps) {
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
              <label className="ppg-field-label" htmlFor={`prettest_answer_item_${n}`}>
                {answerForQuestion(n)}
              </label>
              <input
                className="ppg-input"
                id={`prettest_answer_item_${n}`}
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
