import { test, expect, vi } from 'vitest'

/**
 * PPGA #60: `ppg_read_latest_review` returns `{"latest": null, ...}` when the
 * caller has no review (PL/pgSQL SELECT INTO sets the target NULL on zero
 * rows, overriding the `'{}'::jsonb` initialiser). The result page must show
 * the "no review yet" state rather than dereferencing the missing row.
 *
 * These are pure function tests: the lib module is server-only, so the module
 * marker and `next/headers` are stubbed before the import resolves (no DB, no
 * request context).
 */
vi.mock('server-only', () => ({}))
vi.mock('next/headers', () => ({ cookies: vi.fn() }))

import { latestReviewStateFromRpc } from '../../lib/sup/reviews'

test('a missing payload yields the empty state', () => {
  expect(latestReviewStateFromRpc(null)).toEqual({
    status: 'empty',
    detail: 'no review yet',
  })
})

test('a null `latest` yields the empty state and does not throw', () => {
  expect(() =>
    latestReviewStateFromRpc({ latest: null, history: [] }),
  ).not.toThrow()
  expect(latestReviewStateFromRpc({ latest: null, history: [] })).toEqual({
    status: 'empty',
    detail: 'no review yet',
  })
})

test('an empty `latest` object yields the empty state (no submission_seq)', () => {
  const payload = { latest: {} as never, history: [] }
  expect(() => latestReviewStateFromRpc(payload)).not.toThrow()
  expect(latestReviewStateFromRpc(payload)).toEqual({
    status: 'empty',
    detail: 'no review yet',
  })
})

test('a present latest row still maps to the ok state', () => {
  const state = latestReviewStateFromRpc({
    latest: {
      submission_seq: 1,
      scores: {
        content_structure: 4,
        text_formatting: 4,
        images_visual: 3,
        slide_design: 4,
        powerpoint_tool_usage: 5,
        creativity: 4,
        completeness: 4,
      },
      total_score: 28,
      decision: 'approved',
      feedback_th: 'ดี',
      feedback_en: 'Good',
    },
    history: [],
  })
  expect(state).toEqual({
    status: 'ok',
    latest: {
      submission_seq: 1,
      scores: {
        content_structure: 4,
        text_formatting: 4,
        images_visual: 3,
        slide_design: 4,
        tool_usage: 5,
        creativity: 4,
        completeness: 4,
      },
      total_score: 28,
      decision: 'approved',
      feedback_th: 'ดี',
      feedback_en: 'Good',
    },
    history: [],
  })
})
