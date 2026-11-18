/**
 * PPGA #83 UI contract (component render, no DB): the 50-item research
 * Pre-Test renders ONE required `item_<n>` radio group per item (accepting the
 * shipped A-D keys), each group labelled by `answerForQuestion(n)`, every
 * choice a real clickable radio with a unique id, all inside the one form the
 * route POSTs. The free-text answer inputs are gone; the seeded choice rows
 * are the controls.
 */
import { readFileSync } from 'node:fs'

import { render, cleanup, fireEvent } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, test, expect } from 'vitest'

import { PreTestItems, type PreTestItem } from '../../components/PreTestItems'
import enMessages from '../../messages/en.json'

afterEach(() => cleanup())

const KEYS = ['A', 'B', 'C', 'D'] as const

const makeItems = (count: number): PreTestItem[] =>
  Array.from({ length: count }, (_, i) => {
    const n = i + 1
    return {
      id: `item-${n}`,
      th: {
        prompt: `Thai prompt ${n}`,
        choices: { A: `ตัวเลือก A ${n}`, B: `ตัวเลือก B ${n}`, C: `ตัวเลือก C ${n}` },
      },
      en: {
        prompt: `English prompt ${n}`,
        choices: { A: `Choice A ${n}`, B: `Choice B ${n}`, C: `Choice C ${n}` },
      },
    }
  })

function renderList(count = 50) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <form action="/api/prettest/submit" method="POST">
        <PreTestItems
          items={makeItems(count)}
          locale="en"
          questionTag={(n) => `Question ${n}`}
          itemProgress={(n, total) => `Question ${n}/${total}`}
          answerForQuestion={(n) => `Answer for question ${n}`}
        />
        <input name="language" defaultValue="en" hidden={true} />
      </form>
    </NextIntlClientProvider>,
  )
}

test('50 items render 50 required radio groups (item_1..item_50) with every choice as a radio', () => {
  const { container } = renderList(50)
  const groups = [...container.querySelectorAll<HTMLElement>('[role="radiogroup"]')]
  expect(groups).toHaveLength(50)
  expect(groups.map((group) => group.getAttribute('aria-label'))).toEqual(
    Array.from({ length: 50 }, (_, i) => `Answer for question ${i + 1}`),
  )

  const expectedNames = Array.from({ length: 50 }, (_, i) => `item_${i + 1}`)
  groups.forEach((group, i) => {
    const radios = [...group.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
    expect(radios.map((radio) => radio.name)).toEqual(Array(3).fill(expectedNames[i]))
    expect(radios.map((radio) => radio.value)).toEqual(['A', 'B', 'C'])
    for (const radio of radios) expect(radio.required).toBe(true)
    // The radios are raised to uppercase keys for the server's A-D contract.
  })

  // Every choice row is a radio: 50 items x 3 seeded choices.
  expect(container.querySelectorAll('.ppg-instr-opt')).toHaveLength(150)
  expect(container.querySelectorAll<HTMLInputElement>('input[type="radio"]')).toHaveLength(150)
})

test('the old free-text answer inputs are gone', () => {
  const { container } = renderList(50)
  expect(container.querySelectorAll('input.ppg-input')).toHaveLength(0)
  expect(container.querySelectorAll('input[pattern]')).toHaveLength(0)
  const visibleInputs = [...container.querySelectorAll<HTMLInputElement>('input')].filter(
    (input) => input.type !== 'radio' && input.name !== 'language',
  )
  expect(visibleInputs).toHaveLength(0)
  // No stale label points at a removed control (the old `answer_item_<n>` id).
  expect(container.querySelector('#prettest_answer_item_1')).toBeNull()
})

test('each radio has a unique id using the prefix scheme', () => {
  const { container } = renderList(50)
  const radios = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]')]
  const ids = radios.map((radio) => radio.id)
  expect(new Set(ids).size).toBe(ids.length)
  expect(container.querySelector<HTMLInputElement>('#prettest_answer_item_1_A')?.name).toBe('item_1')
  expect(container.querySelector<HTMLInputElement>('#prettest_answer_item_50_C')?.name).toBe('item_50')
})

test('the wrapping form posts every item_* field with its uppercase selection', () => {
  const { container } = renderList(50)
  const form = container.querySelector('form') as HTMLFormElement

  // Click one radio per item, cycling A/B/C - the native `required` contract
  // means the form cannot submit until all 50 groups are answered.
  for (let n = 1; n <= 50; n++) {
    const value = KEYS[(n - 1) % 3]
    fireEvent.click(container.querySelector<HTMLInputElement>(`input[name="item_${n}"][value="${value}"]`)!)
  }

  const data = new FormData(form)
  const expected = Array.from({ length: 50 }, (_, i) => `item_${i + 1}`)
  expect([...data.keys()].sort()).toEqual([...expected, 'language'].sort())
  for (const name of expected) {
    const n = Number(name.slice('item_'.length))
    expect(data.get(name)).toBe(KEYS[(n - 1) % 3])
  }
  expect(data.get('language')).toBe('en')
})

test('selecting a choice paints the checked state on its row only', () => {
  const { container } = renderList(50)
  fireEvent.click(container.querySelector<HTMLInputElement>('input[name="item_7"][value="B"]')!)
  const checked = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked')]
  expect(checked).toHaveLength(1)
  expect(checked[0].name).toBe('item_7')
  expect(checked[0].value).toBe('B')

  // Clicking another choice in the same group moves the selection.
  fireEvent.click(container.querySelector<HTMLInputElement>('input[name="item_7"][value="C"]')!)
  const next = [...container.querySelectorAll<HTMLInputElement>('input[type="radio"]:checked')]
  expect(next).toHaveLength(1)
  expect(next[0].value).toBe('C')
})

test('the page wraps the item list in the shipped submit form', () => {
  const page = readFileSync(`${process.cwd()}/app/[locale]/pre-test/page.tsx`, 'utf8')
  const formOpen = page.indexOf('data-ppg-pretest-form="prettest"')
  const items = page.indexOf('<PreTestItems')
  const formClose = page.indexOf('</form>', formOpen)

  expect(formOpen).toBeGreaterThan(-1)
  expect(items).toBeGreaterThan(formOpen)
  expect(items).toBeLessThan(formClose)
  expect(page.includes('data-ppg-pretest-submit="true"')).toBe(true)
  expect(page.includes('action="/api/prettest/submit"')).toBe(true)
})
