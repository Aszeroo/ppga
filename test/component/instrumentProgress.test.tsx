/**
 * @vit-environment jsdom
 */
import { cleanup, fireEvent, render } from '@testing-library/react'
import { afterEach, expect, test } from 'vitest'

import { InstrumentProgress } from '../../components/InstrumentProgress'

afterEach(() => cleanup())

function renderForm() {
  return render(
    <form action="/api/prettest/submit" method="POST">
      <InstrumentProgress total={3} template="Answered {answered} / {total}" />
      {[1, 2, 3].map((n) => (
        <div key={n}>
          <input type="radio" id={`item_${n}_A`} name={`item_${n}`} value="A" required />
          <input type="radio" id={`item_${n}_B`} name={`item_${n}`} value="B" required />
        </div>
      ))}
    </form>,
  )
}

test('the counter starts at 0 and updates from the form change event', () => {
  const { container } = renderForm()
  const line = () => container.querySelector('[data-ppg-instrument-progress]') as HTMLElement

  expect(line().hidden).toBe(false)
  expect(line().textContent).toBe('Answered 0 / 3')

  fireEvent.click(container.querySelector<HTMLInputElement>('#item_1_A')!)
  expect(line().textContent).toBe('Answered 1 / 3')

  // A second choice in the same group replaces, never increments, the answer.
  fireEvent.click(container.querySelector<HTMLInputElement>('#item_1_B')!)
  expect(line().textContent).toBe('Answered 1 / 3')

  fireEvent.click(container.querySelector<HTMLInputElement>('#item_2_A')!)
  fireEvent.click(container.querySelector<HTMLInputElement>('#item_3_B')!)
  expect(line().textContent).toBe('Answered 3 / 3')
})
