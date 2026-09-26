import { test, expect } from 'vitest'

/**
 * Ticket #11 unit tests for the PURE Knowledge Mission score math the
 * DATABASE's `ppg_submit_mission` speaks the same authority: score% =
 * the matched correct options / all correct options, rounded (the
 * `round(100 * matched / total)`); PASS iff score% >= 70 (the
 * `pass_threshold_pct` the read RPC carries). The tests below assert the
 * same shape no client math: 0/3 → 0 fail, 1/3 → 33 fail, 2/3 → 67
 * fail (67 < 70), 3/3 → 100 pass; 21/30 → 70 pass (at the threshold,
 * no fake rounding).
 */
const scoreOf = (matched: number, total: number) => Math.round(100 * matched / total)
const passOf = (score: number) => score >= 70

test('Score: matched/total rounded (0/3 → 0, 1/3 → 33, 2/3 → 67, 3/3 → 100)', () => {
  expect(scoreOf(0, 3)).toBe(0)
  expect(scoreOf(1, 3)).toBe(33)
  expect(scoreOf(2, 3)).toBe(67)
  expect(scoreOf(3, 3)).toBe(100)
})

test('Threshold: PASS iff >= 70 (67 fail, 70 pass, 100 pass — the server decides)', () => {
  expect(passOf(67)).toBe(false)
  expect(passOf(70)).toBe(true)
  expect(passOf(100)).toBe(true)
})

test('At the threshold: 21/30 → 70 pass exactly (no fake rounding at the gate)', () => {
  expect(scoreOf(21, 30)).toBe(70)
  expect(passOf(scoreOf(21, 30))).toBe(true)
  expect(passOf(scoreOf(20, 30))).toBe(false)
})
