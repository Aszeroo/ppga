/**
 * Ticket #74 Chapter-test pure logic: the 70% gate arithmetic, the parallel
 * objective coverage check the UI/tests share, and the next-chapter key.
 * No server imports — unit-testable like `lib/courseStages.ts`.
 *
 * The DB is still the authority (the submit RPC computes the score and the
 * pass); these helpers name the same rule for the client view + tests.
 */

export const CHAPTER_PASS_PERCENT = 70

/** A Chapter passes when the best score reaches 70% of the items. */
export function isChapterTestPassed(score: number, itemCount: number): boolean {
  if (!Number.isFinite(score) || !Number.isFinite(itemCount) || itemCount <= 0) return false
  return score * 100 >= CHAPTER_PASS_PERCENT * itemCount
}

/** `chapter-01` -> `chapter-02`. Non-conforming keys return null. */
export function nextChapterKey(chapterKey: string): string | null {
  const match = /^chapter-(\d{2})$/.exec(chapterKey)
  if (!match) return null
  return `chapter-${String(Number(match[1]) + 1).padStart(2, '0')}`
}

/** The seeded chapter-key shape. */
export function isChapterKey(key: string): boolean {
  return /^chapter-\d{2}$/.test(key)
}

/** The pre/post phase vocabulary. */
export type ChapterTestPhase = 'pre' | 'post'

export function isChapterTestPhase(value: string): value is ChapterTestPhase {
  return value === 'pre' || value === 'post'
}

/**
 * Parallel-form coverage: the two banks cover the same objective set. Used
 * by the seam tests as the JS mirror of the DB bank guard.
 */
export function objectivesCoveredIdentically(
  pre: readonly { objective_key: string }[],
  post: readonly { objective_key: string }[],
): boolean {
  const a = new Set(pre.map((q) => q.objective_key))
  const b = new Set(post.map((q) => q.objective_key))
  if (a.size !== b.size) return false
  for (const key of a) if (!b.has(key)) return false
  return true
}
