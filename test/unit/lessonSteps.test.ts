import { test, expect } from 'vitest'

import {
  legacySteps,
  localizeGrade,
  mapStepRows,
  nextStepIndex,
  previousStepIndex,
  resolveLessonSteps,
  stepProgress,
  type LessonStepRow,
} from '../../lib/lessonSteps'

const CHECK_ROW: LessonStepRow = {
  order_index: 4,
  kind: 'check',
  body_th: '',
  body_en: '',
  check: {
    prompt_th: 'prompt-th',
    prompt_en: 'prompt-en',
    options: [
      { option_key: 'c', option_th: 'c-th', option_en: 'c-en' },
      { option_key: 'a', option_th: 'a-th', option_en: 'a-en' },
      { option_key: 'b', option_th: 'b-th', option_en: 'b-en' },
    ],
  },
}

const LEGACY = {
  what_learn_th: 'wl-th',
  what_learn_en: 'wl-en',
  why_th: 'why-th',
  why_en: 'why-en',
  body_th: 'body-th',
  body_en: 'body-en',
  what_next_th: 'next-th',
  what_next_en: 'next-en',
}

test('mapStepRows: sorted, localized, options lettered in key order', () => {
  const rows: LessonStepRow[] = [
    { order_index: 2, kind: 'summary', body_th: 's-th', body_en: 's-en' },
    { order_index: 1, kind: 'objective', body_th: 'o-th', body_en: 'o-en' },
    CHECK_ROW,
  ]
  const steps = mapStepRows(rows, 'en')
  expect(steps.map((s) => s.orderIndex)).toEqual([1, 2, 4])
  expect(steps[0].body).toBe('o-en')
  expect(steps[2].check?.prompt).toBe('prompt-en')
  expect(steps[2].check?.options.map((o) => o.optionKey)).toEqual(['a', 'b', 'c'])
  expect(steps[2].check?.options[1].label).toBe('b-en')

  const thai = mapStepRows(rows, 'th')
  expect(thai[0].body).toBe('o-th')
  expect(thai[2].check?.prompt).toBe('prompt-th')
})

test('mapStepRows: drops unknown kinds and never carries answer-key/explanation fields', () => {
  const leaked = {
    ...CHECK_ROW,
    check_answer_key: 'c',
    check_explanation_th: 'secret-th',
    check_explanation_en: 'secret-en',
    check: {
      ...CHECK_ROW.check,
      check_answer_key: 'c',
      explanation_th: 'secret-th',
    },
  } as unknown as LessonStepRow
  const steps = mapStepRows([leaked], 'en')
  const serialized = JSON.stringify(steps)
  expect(serialized).not.toContain('secret')
  expect(serialized).not.toContain('answer_key')
  expect(steps[0].check?.options.length).toBe(3)

  const unknown = mapStepRows([{ order_index: 1, kind: 'video', body_th: '', body_en: '' }], 'en')
  expect(unknown).toEqual([])
})

test('legacy adapter: what_learn -> objective, why + body -> explanation, what_next -> summary', () => {
  const steps = legacySteps(LEGACY, 'en')
  expect(steps.map((s) => s.kind)).toEqual(['objective', 'explanation', 'summary'])
  expect(steps[0].body).toBe('wl-en')
  expect(steps[1].body).toBe('why-en body-en')
  expect(steps[2].body).toBe('next-en')
  expect(steps.some((s) => s.check)).toBe(false)

  const thai = legacySteps(LEGACY, 'th')
  expect(thai[1].body).toBe('why-th body-th')
})

test('resolveLessonSteps: real steps win; a legacy lesson falls back without errors', () => {
  const seeded = resolveLessonSteps(LEGACY, [CHECK_ROW], 'en')
  expect(seeded.map((s) => s.orderIndex)).toEqual([4])
  const legacy = resolveLessonSteps(LEGACY, [], 'en')
  expect(legacy.map((s) => s.kind)).toEqual(['objective', 'explanation', 'summary'])
  expect(resolveLessonSteps(null, [], 'en')).toEqual([])
})

test('step navigation: next/back clamp at the ends and never skip or gate', () => {
  expect(nextStepIndex(0, 5)).toBe(1)
  expect(nextStepIndex(3, 5)).toBe(4)
  expect(nextStepIndex(4, 5)).toBe(4)
  expect(nextStepIndex(0, 0)).toBe(0)
  expect(previousStepIndex(4, 5)).toBe(3)
  expect(previousStepIndex(0, 5)).toBe(0)
  expect(previousStepIndex(0, 0)).toBe(0)
})

test('step progress: 1-based value clamped to the step count', () => {
  expect(stepProgress(0, 5)).toEqual({ value: 1, min: 1, max: 5 })
  expect(stepProgress(4, 5)).toEqual({ value: 5, min: 1, max: 5 })
  expect(stepProgress(9, 5)).toEqual({ value: 5, min: 1, max: 5 })
  expect(stepProgress(0, 0)).toEqual({ value: 0, min: 1, max: 1 })
})

test('mini-check feedback: correct/incorrect tone plus the localized explanation', () => {
  const en = localizeGrade({ correct: true, explanation_th: 'th-why', explanation_en: 'en-why' }, 'en')
  expect(en).toEqual({ correct: true, tone: 'correct', explanation: 'en-why' })
  const th = localizeGrade({ correct: false, explanation_th: 'th-why', explanation_en: 'en-why' }, 'th')
  expect(th).toEqual({ correct: false, tone: 'incorrect', explanation: 'th-why' })
  const empty = localizeGrade({ correct: false, explanation_th: ' ', explanation_en: '' }, 'en')
  expect(empty.explanation).toBe(null)
})
