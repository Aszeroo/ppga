import { test, expect } from 'vitest'

/**
 * Ticket #10 unit tests for the PURE Level/progress formula the header
 * renders (the DATABASE's `ppg_xp_summary` the same authority speaks — the
 * formulas here assert the same shape no fake numbers): level =
 * floor(total/100)+1; xp-to-next = level*100 - total; progress =
 * remainder/100 where remainder = total - floor(total/100)*100.
 */
const levelOf = (total: number) => Math.floor(total / 100) + 1
const xpToNextOf = (total: number) => levelOf(total) * 100 - total
const progressOf = (total: number) => (total - Math.floor(total / 100) * 100) / 100

test('Level: floor(total/100)+1 at the thresholds (50 → 1, 100 → 2, 150 → 2, 200 → 3)', () => {
  expect(levelOf(0)).toBe(1)
  expect(levelOf(50)).toBe(1)
  expect(levelOf(99)).toBe(1)
  expect(levelOf(100)).toBe(2)
  expect(levelOf(150)).toBe(2)
  expect(levelOf(200)).toBe(3)
})

test('xp-to-next: level*100 - total (50 → 50, 150 → 50, 200 → 100)', () => {
  expect(xpToNextOf(50)).toBe(50)
  expect(xpToNextOf(150)).toBe(50)
  expect(xpToNextOf(200)).toBe(100)
})

test('progress: remainder/100 (50 → 0.5, 150 → 0.5, 200 → 0)', () => {
  expect(progressOf(50)).toBe(0.5)
  expect(progressOf(150)).toBe(0.5)
  expect(progressOf(200)).toBe(0)
})