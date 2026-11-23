/**
 * PPGA satisfaction-survey UI contract (component render, no DB): the survey
 * now uses the same per-item control system as the Pre-Test and Final Test,
 * rendering ONE required `item_<n>` radio group per item with the `survey`
 * answer-id stem, so the route's `item_` filter forwards a complete payload.
 * The old typed `^[A-C]$` inputs and the separate presentation-only item list
 * are gone; the satisfaction instrument carries no answer key.
 */
import { readFileSync } from 'node:fs'

import { render, cleanup, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, test, expect } from 'vitest'

import { InstrumentItems, type PreTestItem } from '../../components/PreTestItems'
import enMessages from '../../messages/en.json'

afterEach(() => cleanup())

const makeItems = (count: number): PreTestItem[] =>
  Array.from({ length: count }, (_, i) => {
    const n = i + 1
    return {
      id: `item-${n}`,
      th: {
        prompt: `Thai prompt ${n}`,
        choices: { A: `Thai choice A ${n}`, B: `Thai choice B ${n}`, C: `Thai choice C ${n}` },
      },
      en: {
        prompt: `English prompt ${n}`,
        choices: { A: `Choice A ${n}`, B: `Choice B ${n}`, C: `Choice C ${n}` },
      },
    }
  })

function renderList(count = 2) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <form action="/api/survey/submit" method="POST">
        <InstrumentItems
          items={makeItems(count)}
          locale="en"
          answerIdPrefix="survey"
          questionTag={(n) => `Question ${n}`}
          itemProgress={(n, total) => `Question ${n}/${total}`}
          answerForQuestion={(n) => `Answer for question ${n}`}
        />
        <input name="language" defaultValue="en" hidden={true} />
      </form>
    </NextIntlClientProvider>,
  )
}

test('one required radio group per survey item, named item_<n> with uppercase values', () => {
  const { container } = renderList(2)
  const groups = [...container.querySelectorAll<HTMLElement>('[role="radiogroup"]')]
  expect(groups).toHaveLength(2)
  expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual([
    'Answer for question 1',
    'Answer for question 2',
  ])

  groups.forEach((group, i) => {
    const radios = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(radios.map((radio) => radio.name)).toEqual(Array(3).fill(`item_${i + 1}`))
    expect(radios.map((radio) => radio.value)).toEqual(['A', 'B', 'C'])
    for (const radio of radios) expect(radio.required).toBe(true)
  })

  expect(container.querySelectorAll('.ppg-instr-opt')).toHaveLength(6)
  expect(container.querySelectorAll<HTMLInputElement>('input[type="radio"]')).toHaveLength(6)
})

test('the old typed answer inputs are gone', () => {
  const { container } = renderList(2)
  expect(container.querySelectorAll('input.ppg-input')).toHaveLength(0)
  expect(container.querySelectorAll('input[pattern]')).toHaveLength(0)
  const visibleInputs = [...container.querySelectorAll<HTMLInputElement>('input')].filter(
    (input) => input.type !== 'radio' && input.name !== 'language',
  )
  expect(visibleInputs).toHaveLength(0)
  expect(container.querySelector('#survey_answer_item_1')).toBeNull()
})

test('each radio has a unique id using the survey prefix scheme', () => {
  const { container } = renderList(2)
  const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
  const ids = radios.map((radio) => radio.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(container.querySelector<HTMLInputElement>('#survey_answer_item_1_A')?.name).toBe('item_1')
  expect(container.querySelector<HTMLInputElement>('#survey_answer_item_2_C')?.name).toBe('item_2')
})

test('the wrapping form posts every item_* field with its uppercase selection', () => {
  const { container } = renderList(2)
  const form = container.querySelector('form') as HTMLFormElement

  fireEvent.click(container.querySelector<HTMLInputElement>('input[name="item_1"][value="B"]')!)
  fireEvent.click(container.querySelector<HTMLInputElement>('input[name="item_2"][value="C"]')!)

  const data = new FormData(form)
  expect([...data.keys()].sort()).toEqual(['item_1', 'item_2', 'language'].sort())
  expect(data.get('item_1')).toBe('B')
  expect(data.get('item_2')).toBe('C')
  expect(data.get('language')).toBe('en')
})

test('the page wraps the item list in the shipped survey submit form', () => {
  const page = readFileSync(`${process.cwd()}/app/[locale]/survey/page.tsx`, 'utf8')
  const formOpen = page.indexOf('data-ppg-survey-form="survey"')
  const items = page.indexOf('<InstrumentItems')
  const progress = page.indexOf('<InstrumentProgress')
  const formClose = page.indexOf('</form>', formOpen)

  expect(formOpen).toBeGreaterThan(-1)
  expect(items).toBeGreaterThan(formOpen)
  expect(items).toBeLessThan(formClose)
  expect(progress).toBeGreaterThan(formOpen)
  expect(progress).toBeLessThan(formClose)
  expect(page.includes('data-ppg-survey-submit="true"')).toBe(true)
  expect(page.includes('method="POST"')).toBe(true)
  expect(page.includes('action="/api/survey/submit"')).toBe(true)
  expect(page.includes('answerIdPrefix="survey"')).toBe(true)
  expect(page.includes('answerForQuestion')).toBe(true)
  expect(page.includes(`answeredCount`)).toBe(true)

  // The hardcoded typed inputs of the old form must never come back.
  expect(page.includes('pattern="^[A-C]$"')).toBe(false)
  expect(page.includes('id="survey_answer_item_1"')).toBe(false)
  expect(page.includes('id="survey_answer_item_2"')).toBe(false)
})
