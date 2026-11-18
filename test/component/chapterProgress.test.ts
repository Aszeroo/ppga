import { test, expect } from 'vitest'
import fs from 'node:fs'

import {
  aggregatePhase,
  buildChapterProgress,
  buildFinalTestProgress,
  buildRosterProgress,
  chapterCourseProgress,
  currentChapter,
  deriveLoopNextAction,
  type ChapterMeta,
  type FinalTestProgress,
  type FinalTestResponseRow,
  type FinalTestRetryRow,
  type MissionCompletionRow,
} from '../../lib/chapterProgress'
import { buildStageMapView } from '../../lib/courseStages'

/**
 * PPGA #86: the CAI loop's pure model. The database is still the authority
 * for scores, attempts and unlocks; these tests pin that the view NAMES what
 * the reads say and points at the correct next step for every chapter state.
 */

const chapterMetas = (openThrough = 1): ChapterMeta[] =>
  Array.from({ length: 9 }, (_, i) => ({
    chapter_key: `chapter-${String(i + 1).padStart(2, '0')}`,
    order_index: i + 1,
    title_th: `บทที่ ${i + 1}`,
    title_en: `Chapter ${i + 1}`,
    open: i + 1 <= openThrough,
  }))

const learner = 'learner-1'

const attempt = (
  chapter: number,
  phase: 'pre' | 'post',
  seq: number,
  score: number,
): {
  learner_id: string
  chapter_key: string
  phase: 'pre' | 'post'
  attempt_seq: number
  score: number
  item_count: number
  submitted_at: string
} => ({
  learner_id: learner,
  chapter_key: `chapter-${String(chapter).padStart(2, '0')}`,
  phase,
  attempt_seq: seq,
  score,
  item_count: 10,
  submitted_at: '2026-11-17T00:00:00Z',
})

const completed = (chapter: number): MissionCompletionRow => ({
  learner_id: learner,
  module_key: `chapter-${String(chapter).padStart(2, '0')}`,
  status: 'complete',
})

const finalTest = (over: Partial<FinalTestProgress> = {}): FinalTestProgress => ({
  completed: false,
  first_score: null,
  best_score: null,
  attempts: 0,
  instrument_version: null,
  ...over,
})

test('aggregatePhase: first/best/last, attempts and the 70% post-test rule', () => {
  const post = aggregatePhase(
    [attempt(1, 'post', 1, 6), attempt(1, 'post', 2, 8)],
    'post',
  )
  expect(post).toMatchObject({
    submitted: true,
    attempts: 2,
    first_score: 6,
    best_score: 8,
    last_score: 8,
    item_count: 10,
    passed: true,
  })
  // A pre-test is diagnostic: even a perfect score never "passes" it.
  expect(aggregatePhase([attempt(1, 'pre', 1, 10)], 'pre').passed).toBe(false)
  expect(aggregatePhase([], 'post')).toMatchObject({ submitted: false, attempts: 0, passed: false })
})

test('buildChapterProgress + chapterCourseProgress: own attempts and Mission rows only', () => {
  const chapters = buildChapterProgress(
    learner,
    chapterMetas(2),
    [
      attempt(1, 'pre', 1, 5),
      attempt(1, 'post', 1, 6),
      attempt(1, 'post', 2, 9),
      { ...attempt(2, 'post', 1, 10), learner_id: 'someone-else' },
    ],
    [completed(1), { learner_id: 'someone-else', module_key: 'chapter-02', status: 'complete' }],
  )
  expect(chapters).toHaveLength(9)
  expect(chapters[0]).toMatchObject({ mission_complete: true })
  expect(chapters[0]!.post.passed).toBe(true)
  expect(chapters[1]!.post.submitted).toBe(false)
  expect(chapterCourseProgress(chapters)).toEqual({ completed: 1, total: 9, progressPct: 11 })
  expect(currentChapter(chapters)?.chapter_key).toBe('chapter-02')
})

test('next action: consent -> global pre-test -> chapter pre-test -> lessons/mission -> post-test', () => {
  const base = {
    gateOk: true,
    consent: false,
    override: false,
    globalPretestSubmitted: false,
    chapters: buildChapterProgress(learner, chapterMetas(1), [], []),
    finalTest: null,
    surveyUnlocked: false,
    surveySubmitted: false,
  }

  expect(deriveLoopNextAction(base)?.kind).toBe('consent')
  // The consent CTA must reach the explanation page, never reload the hub.
  expect(deriveLoopNextAction(base)?.href).toBe('/content')
  expect(deriveLoopNextAction({ ...base, consent: true })?.kind).toBe('global-pretest')
  expect(
    deriveLoopNextAction({ ...base, consent: true, globalPretestSubmitted: true })?.kind,
  ).toBe('chapter-pretest')

  const preDone = buildChapterProgress(learner, chapterMetas(1), [attempt(1, 'pre', 1, 4)], [])
  const lessons = deriveLoopNextAction({ ...base, consent: true, globalPretestSubmitted: true, chapters: preDone })
  expect(lessons?.kind).toBe('chapter-lessons')
  expect(lessons?.href).toEqual({ pathname: '/course/[moduleKey]', params: { moduleKey: 'chapter-01' } })

  const missionDone = buildChapterProgress(
    learner,
    chapterMetas(1),
    [attempt(1, 'pre', 1, 4)],
    [completed(1)],
  )
  const posttest = deriveLoopNextAction({
    ...base,
    consent: true,
    globalPretestSubmitted: true,
    chapters: missionDone,
  })
  expect(posttest?.kind).toBe('chapter-posttest')
  expect(posttest?.href).toEqual({
    pathname: '/course/[moduleKey]/chapter-test/[phase]',
    params: { moduleKey: 'chapter-01', phase: 'post' },
  })
})

test('next action: a passing post-test advances to the next chapter', () => {
  const passed = buildChapterProgress(
    learner,
    chapterMetas(2),
    [attempt(1, 'pre', 1, 5), attempt(1, 'post', 1, 7)],
    [completed(1)],
  )
  const action = deriveLoopNextAction({
    gateOk: true,
    consent: true,
    override: false,
    globalPretestSubmitted: true,
    chapters: passed,
    finalTest: null,
    surveyUnlocked: false,
    surveySubmitted: false,
  })
  expect(action?.kind).toBe('chapter-pretest')
  expect(action?.chapterKey).toBe('chapter-02')
})

test('next action: Final Test -> survey -> done, and a locked chapter never fakes a test', () => {
  const allPassed = buildChapterProgress(
    learner,
    chapterMetas(9),
    Array.from({ length: 9 }, (_, i) => attempt(i + 1, 'post', 1, 9)),
    Array.from({ length: 9 }, (_, i) => completed(i + 1)),
  )
  const base = {
    gateOk: true,
    consent: true,
    override: false,
    globalPretestSubmitted: true,
    chapters: allPassed,
    finalTest: finalTest(),
    surveyUnlocked: true,
    surveySubmitted: false,
  }
  expect(deriveLoopNextAction(base)?.kind).toBe('final-test')
  expect(deriveLoopNextAction({ ...base, finalTest: finalTest({ completed: true }) })?.kind).toBe('survey')
  expect(
    deriveLoopNextAction({
      ...base,
      finalTest: finalTest({ completed: true }),
      surveySubmitted: true,
    })?.kind,
  ).toBe('done')

  const locked = buildChapterProgress(learner, chapterMetas(0), [], [])
  const lockedAction = deriveLoopNextAction({ ...base, chapters: locked })
  expect(lockedAction?.kind).toBe('course')
  expect(lockedAction?.explanationKey).toBe('loop.chapterLocked')
})

test('Final Test aggregate: first attempt is the measure, best/attempts ride the retry stream', () => {
  const responses: FinalTestResponseRow[] = [
    { learner_id: learner, instrument_version: '2026.11.1', score: 30, submitted_at: '2026-11-17T01:00:00Z' },
  ]
  const retries: FinalTestRetryRow[] = [
    { learner_id: learner, attempt_no: 2, score: 42, submitted_at: '2026-11-17T02:00:00Z' },
    { learner_id: learner, attempt_no: 3, score: null, submitted_at: null },
  ]
  expect(buildFinalTestProgress(responses, retries, learner)).toEqual({
    completed: true,
    first_score: 30,
    best_score: 42,
    attempts: 2,
    instrument_version: '2026.11.1',
  })
  expect(buildFinalTestProgress([], [], learner)).toBeNull()
})

test('course map: all nine chapters render with real pre/post/Mission progress', () => {
  const modules = chapterMetas(9).map((c) => ({
    module_key: c.chapter_key,
    order_index: c.order_index,
    title_th: c.title_th,
    title_en: c.title_en,
    summary_th: '',
    summary_en: '',
    lock_state: 'open' as const,
  }))
  const progress = buildChapterProgress(
    learner,
    chapterMetas(9),
    [attempt(1, 'pre', 1, 5), attempt(1, 'post', 1, 8)],
    [completed(1)],
  )
  const view = buildStageMapView(
    { status: 'ok', modules },
    { status: 'ok', uid: learner, rows: [{ module_key: 'chapter-01', learner_id: learner }] },
    progress,
  )
  expect(view.stages).toHaveLength(9)
  expect(view.stages[0]!.progress?.post.best_score).toBe(8)
  expect(view.stages[0]!.progress?.mission_complete).toBe(true)
  expect(view.stages[8]!.progress?.post.submitted).toBe(false)
  expect(view.total).toBe(9)
})

test('teacher roster: one row per learner with chapter + Final Test state', () => {
  const roster = buildRosterProgress(
    [
      { id: learner, student_id: '64110001', full_name: 'Learner One' },
      { id: 'learner-2', student_id: '64110002', full_name: 'Learner Two' },
    ],
    chapterMetas(9),
    [attempt(1, 'post', 1, 9)],
    [completed(1)],
    [{ learner_id: learner, instrument_version: '2026.11.1', score: 40, submitted_at: '2026-11-17T01:00:00Z' }],
    [],
  )
  expect(roster).toHaveLength(2)
  expect(roster[0]).toMatchObject({ learner_id: learner, cleared: 1, total: 9 })
  expect(roster[0]!.final_test?.best_score).toBe(40)
  expect(roster[1]!.cleared).toBe(0)
})

test('dashboard/course-map sources never link a practical, upload or review CTA', () => {
  for (const file of ['app/[locale]/page.tsx', 'app/[locale]/course/page.tsx']) {
    const src = fs.readFileSync(file, 'utf8')
    expect(src).not.toContain('/practical')
    expect(src).not.toContain('/course/[moduleKey]/review')
    expect(src).not.toContain('linkReviewStatus')
    expect(src).not.toContain('submissionLabel')
    expect(src).not.toContain('feedbackLabel')
  }
})

test('the export migration carries the CAI columns and preserves version strings', () => {
  const sql = fs.readFileSync('supabase/migrations/20261117000200_cai_views_export.sql', 'utf8')
  for (const column of [
    'chapter_test_results',
    'mission_results',
    'posttest_best_score',
    'posttest_attempts',
    'legacy_practical_fields',
    'legacy_rubric_review_count',
    'legacy_rubric_latest_total',
  ]) {
    expect(sql).toContain(column)
  }
  expect(sql).toContain("'posttest_instrument_version', post.instrument_version")
  expect(sql).toContain("'pretest_instrument_version', pre.instrument_version")
  expect(sql).toContain('legacy: practical worksheets')
})
