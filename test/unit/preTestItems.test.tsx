/**
 * PPGA #83 UI contract (component render, no DB): the 50-item research
 * Pre-Test renders ONE required `item_<n>` control per item (accepting the
 * shipped A–D letters), each with an accessible label naming its question and
 * a unique id, all inside the one form the route POSTs. The seeded choice
 * tiles stay visible and presentational.
 */
import { readFileSync } from 'node:fs'

import { render, cleanup } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, test, expect } from 'vitest'

import { PreTestItems, type PreTestItem } from '../../components/PreTestItems'
import enMessages from '../../messages/en.json'

afterEach(() => cleanup())

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

test('50 items render 50 required A-D controls (item_1..item_50) plus the choice tiles', () => {
  const { container } = renderList(50)
  const controls = [...container.querySelectorAll<HTMLInputElement>('input[name^="item_"]')]
  const expectedNames = Array.from({ length: 50 }, (_, i) => `item_${i + 1}`)

  expect(controls).toHaveLength(50)
  expect(controls.map((control) => control.name)).toEqual(expectedNames)
  expect(controls.map((control) => control.id)).toEqual(
    expectedNames.map((_, i) => `prettest_answer_item_${i + 1}`),
  )
  for (const control of controls) {
    expect(control.required).toBe(true)
    expect(control.getAttribute('pattern')).toBe('^[A-D]$')
  }
  // The shipped e2e selector and the shipped letter contract still resolve.
  expect(container.querySelector('#prettest_answer_item_1')?.getAttribute('name')).toBe('item_1')
  // The seeded choice tiles stay visible: 50 items x 3 choices.
  expect(container.querySelectorAll('.ppg-instr-opt')).toHaveLength(150)
})

test('each control has an accessible label naming its question and a unique id', () => {
  const { container, getByLabelText } = renderList(50)
  for (const n of [1, 3, 50]) {
    const control = getByLabelText(`Answer for question ${n}`) as HTMLInputElement
    expect(control.name).toBe(`item_${n}`)
    expect(control.id).toBe(`prettest_answer_item_${n}`)
  }
  const ids = [...container.querySelectorAll<HTMLInputElement>('input[name^="item_"]')].map(
    (control) => control.id,
  )
  expect(new Set(ids).size).toBe(50)
})

test('the wrapping form posts every item_* field plus the language', () => {
  const { container } = renderList(50)
  const controls = [...container.querySelectorAll<HTMLInputElement>('input[name^="item_"]')]
  const letters = ['A', 'B', 'C', 'D']
  controls.forEach((control, i) => {
    control.value = letters[i % letters.length]
  })

  const form = container.querySelector('form') as HTMLFormElement
  const data = new FormData(form)
  const expected = Array.from({ length: 50 }, (_, i) => `item_${i + 1}`)

  expect([...data.keys()].sort()).toEqual([...expected, 'language'].sort())
  for (const name of expected) {
    const n = Number(name.slice('item_'.length))
    expect(data.get(name)).toBe(letters[(n - 1) % letters.length])
  }
  expect(data.get('language')).toBe('en')
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
