/**
 * @vit-environment jsdom
 */
import { vi } from 'vitest'

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh: () => undefined }),
  usePathname: () => undefined,
}) as never)

import { cleanup, fireEvent, render } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, expect, test } from 'vitest'

import { AttendanceBoard } from '../../components/AttendanceBoard'

import thMessages from '../../messages/th.json'

const LEARNER_A = 'aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa'
const LEARNER_B = 'bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb'
const SESSION = 'cccccccc-cccc-cccc-cccc-cccccccccccc'

afterEach(() => cleanup())

function renderBoard() {
  return render(
    <NextIntlClientProvider locale="th" messages={thMessages}>
      <AttendanceBoard
        status="ok"
        sessions={[{
          id: SESSION,
          module_key: 'chapter-01',
          session_date: '2026-11-20',
          label_th: 'บทที่ 1',
          label_en: 'Chapter 1',
          present_count: 0,
          early_count: 0,
          behavior_total: 0,
          xp_total: 0,
          records: [],
        }]}
        roster={[
          { id: LEARNER_A, studentId: '64110001', fullName: 'Learner One' },
          { id: LEARNER_B, studentId: '64110002', fullName: 'Learner Two' },
        ]}
        chapters={[{ moduleKey: 'chapter-01', titleTh: 'บทที่ 1', titleEn: 'Chapter 1' }]}
        today="2026-11-20"
        locale="th"
      />
    </NextIntlClientProvider>,
  )
}

test('the XP preview follows present, early and behaviour, and early only enables while present', () => {
  const { container } = renderBoard()
  const preview = () => container.querySelector('[data-ppg-attendance-xp]')?.textContent ?? ''

  expect(preview()).toContain('0 XP')

  const present = container.querySelector(`[data-ppg-attendance-present="${LEARNER_A}"]`) as HTMLInputElement
  const early = container.querySelector(`[data-ppg-attendance-early="${LEARNER_A}"]`) as HTMLInputElement
  const behavior = container.querySelector(`[data-ppg-attendance-behavior="${LEARNER_A}"]`) as HTMLSelectElement

  expect(early.disabled).toBe(true)

  fireEvent.click(present)
  expect(early.disabled).toBe(false)
  expect(preview()).toContain('10 XP')

  fireEvent.click(early)
  expect(preview()).toContain('15 XP')

  fireEvent.change(behavior, { target: { value: '10' } })
  expect(preview()).toContain('25 XP')

  fireEvent.click(present)
  expect(early.disabled).toBe(true)
  expect(early.checked).toBe(false)
  expect(preview()).toContain('10 XP')
})

test('search filters the roster by name or student id and restores every row when cleared', () => {
  const { container } = renderBoard()
  const search = container.querySelector('[data-ppg-attendance-search]') as HTMLInputElement
  const rows = () => [...container.querySelectorAll('[data-ppg-attendance-row]')]
  const names = () => rows().map((row) => row.getAttribute('data-ppg-attendance-row'))

  expect(rows()).toHaveLength(2)

  fireEvent.change(search, { target: { value: 'Learner Two' } })
  expect(names()).toEqual([LEARNER_B])

  fireEvent.change(search, { target: { value: '64110001' } })
  expect(names()).toEqual([LEARNER_A])

  fireEvent.change(search, { target: { value: 'no such learner' } })
  expect(rows()).toHaveLength(0)

  fireEvent.change(search, { target: { value: '' } })
  expect(rows()).toHaveLength(2)
})

test('select-all marks only visible learners present, and unchecking clears present and early', () => {
  const { container } = renderBoard()
  const search = container.querySelector('[data-ppg-attendance-search]') as HTMLInputElement
  const selectAll = container.querySelector('[data-ppg-attendance-select-all]') as HTMLInputElement
  const preview = () => container.querySelector('[data-ppg-attendance-xp]')?.textContent ?? ''
  const present = (id: string) =>
    container.querySelector(`[data-ppg-attendance-present="${id}"]`) as HTMLInputElement
  const early = (id: string) =>
    container.querySelector(`[data-ppg-attendance-early="${id}"]`) as HTMLInputElement

  // Select-all over the filtered view must not silently touch the hidden
  // learner A; early-bird stays a manual per-learner choice.
  fireEvent.change(search, { target: { value: 'Learner Two' } })
  fireEvent.click(selectAll)
  expect(present(LEARNER_B).checked).toBe(true)
  expect(preview()).toContain('10 XP')

  fireEvent.click(early(LEARNER_B))
  expect(preview()).toContain('15 XP')

  fireEvent.change(search, { target: { value: '' } })
  expect(present(LEARNER_A).checked).toBe(false)
  expect(present(LEARNER_B).checked).toBe(true)

  // Select-all now sees both rows and marks both; unchecking clears both,
  // including B's early-bird (never an early without present).
  fireEvent.click(selectAll)
  expect(present(LEARNER_A).checked).toBe(true)
  expect(present(LEARNER_B).checked).toBe(true)
  expect(preview()).toContain('25 XP')

  fireEvent.click(selectAll)
  expect(present(LEARNER_A).checked).toBe(false)
  expect(present(LEARNER_B).checked).toBe(false)
  expect(early(LEARNER_B).checked).toBe(false)
  expect(preview()).toContain('0 XP')
})

test('the history table renders one row per saved session', () => {
  const { container } = renderBoard()
  expect(container.querySelectorAll('[data-ppg-attendance-history]')).toHaveLength(1)
  expect(container.querySelector('[data-ppg-attendance-save]')).not.toBeNull()
})
