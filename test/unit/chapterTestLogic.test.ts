import { test, expect } from 'vitest'

import {
  CHAPTER_PASS_PERCENT,
  isChapterKey,
  isChapterTestPassed,
  isChapterTestPhase,
  nextChapterKey,
  objectivesCoveredIdentically,
} from '../../lib/chapterTest'

/**
 * Ticket #74 pure-logic guards: the 70% arithmetic, the chapter key/phase
 * shapes and the parallel-objective check the DB guard mirrors.
 */
test('70% gate: 7/10 and 14/20 pass; 6/10 and 13/20 do not', () => {
  expect(CHAPTER_PASS_PERCENT).toBe(70)
  expect(isChapterTestPassed(7, 10)).toBe(true)
  expect(isChapterTestPassed(14, 20)).toBe(true)
  expect(isChapterTestPassed(6, 10)).toBe(false)
  expect(isChapterTestPassed(13, 20)).toBe(false)
  // an empty bank never passes
  expect(isChapterTestPassed(0, 0)).toBe(false)
})

test('chapter keys: chapter-01 is valid; chapter-1 / chapter-001 are not', () => {
  expect(isChapterKey('chapter-01')).toBe(true)
  expect(isChapterKey('chapter-09')).toBe(true)
  expect(isChapterKey('chapter-1')).toBe(false)
  expect(isChapterKey('chapter-001')).toBe(false)
  expect(isChapterKey('module-01')).toBe(false)
})

test('next chapter: chapter-01 -> chapter-02, non-chapter keys -> null', () => {
  expect(nextChapterKey('chapter-01')).toBe('chapter-02')
  expect(nextChapterKey('chapter-09')).toBe('chapter-10')
  expect(nextChapterKey('module-01')).toBeNull()
})

test('phases: only pre and post', () => {
  expect(isChapterTestPhase('pre')).toBe(true)
  expect(isChapterTestPhase('post')).toBe(true)
  expect(isChapterTestPhase('mid')).toBe(false)
})

test('parallel coverage: identical objective sets pass; a missing objective fails', () => {
  const pre = [{ objective_key: 'purpose' }, { objective_key: 'audience' }]
  const post = [{ objective_key: 'audience' }, { objective_key: 'purpose' }]
  expect(objectivesCoveredIdentically(pre, post)).toBe(true)
  expect(objectivesCoveredIdentically(pre, [{ objective_key: 'purpose' }])).toBe(false)
  expect(
    objectivesCoveredIdentically(pre, [...post, { objective_key: 'extra' }]),
  ).toBe(false)
})
