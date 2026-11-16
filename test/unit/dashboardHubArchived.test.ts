import { test, expect } from 'vitest'

import { buildHubView } from '../../lib/dashboardHub'

/**
 * PPGA #88: the learner dashboard must not surface archived curriculum. The
 * Course map is the visibility authority; the completion and submission
 * reads are own-rows and can still contain legacy keys from before the #74
 * archive. This pins the hub filter: only modules the map returned count
 * toward progress or supply a submission/feedback card.
 */
const mapChapterOnly = {
  modules: [
    { module_key: 'chapter-01', order_index: 1, title_th: 'บทที่ 1', title_en: 'Chapter 1', lock_state: 'open' as const },
  ],
}

test('archived completions never inflate dashboard progress', () => {
  const view = buildHubView({
    gate: { status: 'ok', consent: true, submitted: true },
    posttest: { status: 'ok', unlocked: false },
    survey: { status: 'ok', unlocked: false },
    map: mapChapterOnly,
    rows: {
      status: 'ok',
      completedModuleKeys: ['module-01', 'module-08'],
      practicalModuleKeys: ['module-08'],
      submissions: [],
    },
    xp: { status: 'ok', level: 1, totalXp: 0, xpToNext: 100, progressPct: 0, badges: [] },
  })

  expect(view.progress).toEqual({ completed: 0, total: 1, progressPct: 0 })
  // the archived completions do not mark the live chapter either
  expect(view.mission?.moduleKey).toBe('chapter-01')
})

test('archived submission rounds never reach the dashboard cards', () => {
  const view = buildHubView({
    gate: { status: 'ok', consent: true, submitted: true },
    posttest: { status: 'ok', unlocked: false },
    survey: { status: 'ok', unlocked: false },
    map: mapChapterOnly,
    rows: {
      status: 'ok',
      completedModuleKeys: [],
      practicalModuleKeys: [],
      submissions: [
        {
          mission_id: 'module-08',
          submission_seq: 3,
          status: 'approved',
          review_verdict: 'approved',
          review_notes_th: 'ดี',
          review_notes_en: 'good',
        },
      ],
    },
    xp: { status: 'ok', level: 2, totalXp: 150, xpToNext: 50, progressPct: 50, badges: [] },
  })

  expect(view.submission).toBeNull()
  expect(view.feedback).toBeNull()
})
