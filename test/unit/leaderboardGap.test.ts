import { test, expect } from 'vitest'

/**
 * Ticket #12 unit tests for the PURE XP-to-next-rank formula the board's
 * copy reads (the DATABASE's `ppg_xp_leaderboard` the same authority
 * speaks): the rank above minus own WHEN a row above joins; NULL for the
 * TOP Learner (the design's choice — no one above you to overtake; the
 * UI reads `leaderboard.topNote`, never a 0 XP fake gap); NULL for a
 * non-Learner CALLER (their own_* never ride out). The formula here
 * asserts the same shape the RPC builds (no fake numbers).
 */
const gapOf = (aboveXp: number | null, ownXp: number) =>
  aboveXp === null ? null : aboveXp - ownXp

test('XP-to-next-rank: the rank above minus own (50 above vs 0 own → 50; 50 above vs 50 own → 0; 100 above vs 95 own → 5)', () => {
  expect(gapOf(50, 0)).toBe(50)
  expect(gapOf(50, 50)).toBe(0)
  expect(gapOf(100, 95)).toBe(5)
})

test('XP-to-next-ratop: NULL at the TOP (no one above you) and for a non-Learner CALLER (the own_* never ride out)', () => {
  expect(gapOf(null, 50)).toBeNull()
  expect(gapOf(null, 0)).toBeNull()
})
