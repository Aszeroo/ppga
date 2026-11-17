/**
 * PPGA #86: the CAI chapter-loop view model. Pure functions over rows the
 * server already read (the Course-map RPC, the chapter attempt stream, the
 * learner's own Mission completion rows, the Final Test aggregate). Nothing
 * here reaches a database and nothing here changes a scoring or unlock rule:
 * the 70% pass arithmetic only NAMES the rule the submit RPC already enforces.
 *
 * The loop the dashboard follows:
 *   consent -> global research pre-test -> per chapter:
 *   pre-test -> lessons/mini-checks + Knowledge Mission -> post-test
 *   -> next chapter -> Final Test -> satisfaction survey.
 *
 * Mini-checks write nothing, so the view can only observe the Mission
 * completion row; after the chapter pre-test the learner is pointed at the
 * chapter overview, which carries the lessons, mini-checks and Mission.
 */

const CHAPTER_PASS_PERCENT = 70

/** One raw `ppg_chapter_test_attempts` row (RLS already scoped it). */
export interface ChapterAttemptRow {
  learner_id: string
  chapter_key: string
  phase: 'pre' | 'post'
  attempt_seq: number
  score: number
  item_count: number
  submitted_at: string | null
}

/** One raw `ppg_module_missions` row. */
export interface MissionCompletionRow {
  learner_id: string
  module_key: string
  status: string
}

/** The chapter metadata a view needs (Course-map row or module row). */
export interface ChapterMeta {
  chapter_key: string
  order_index: number
  title_th: string
  title_en: string
  open: boolean
}

/** One phase's real state (pre or post). */
export interface PhaseProgress {
  submitted: boolean
  attempts: number
  first_score: number | null
  best_score: number | null
  last_score: number | null
  item_count: number
  passed: boolean
}

/** One chapter's real state: the assessment phases + the Mission row. */
export interface ChapterProgress extends ChapterMeta {
  pre: PhaseProgress
  post: PhaseProgress
  mission_complete: boolean
}

/** The Final Test aggregate, as `ppg_final_test_state` speaks it. */
export interface FinalTestProgress {
  completed: boolean
  first_score: number | null
  best_score: number | null
  attempts: number
  instrument_version: string | null
}

/** One raw `ppg_posttest_responses` row (the first attempt). */
export interface FinalTestResponseRow {
  learner_id: string
  instrument_version: string | null
  score: number | null
  submitted_at: string | null
}

/** One raw `ppg_posttest_retry_attempts` row. */
export interface FinalTestRetryRow {
  learner_id: string
  attempt_no?: number
  score: number | null
  submitted_at: string | null
}

const emptyPhase = (): PhaseProgress => ({
  submitted: false,
  attempts: 0,
  first_score: null,
  best_score: null,
  last_score: null,
  item_count: 0,
  passed: false,
})

/** A phase aggregate from the learner's own attempt rows. The pass rule is
 * the same 70% arithmetic the submit RPC applies to the best score; the
 * pre-test is diagnostic, so its `passed` stays false. */
export function aggregatePhase(
  rows: readonly ChapterAttemptRow[],
  phase: 'pre' | 'post',
): PhaseProgress {
  const phaseRows = rows
    .filter((r) => r.phase === phase)
    .slice()
    .sort((a, b) => a.attempt_seq - b.attempt_seq)
  if (phaseRows.length === 0) return emptyPhase()
  const itemCount = Math.max(...phaseRows.map((r) => r.item_count))
  const best = Math.max(...phaseRows.map((r) => r.score))
  return {
    submitted: true,
    attempts: phaseRows.length,
    first_score: phaseRows[0]!.score,
    best_score: best,
    last_score: phaseRows[phaseRows.length - 1]!.score,
    item_count: itemCount,
    passed: phase === 'post' && itemCount > 0 && best * 100 >= CHAPTER_PASS_PERCENT * itemCount,
  }
}

/** The nine-chapter progress for one learner, over the chapters the map
 * showed. Attempts and mission rows are filtered to that learner. */
export function buildChapterProgress(
  learnerId: string,
  chapters: readonly ChapterMeta[],
  attempts: readonly ChapterAttemptRow[],
  missions: readonly MissionCompletionRow[],
): ChapterProgress[] {
  const ownAttempts = attempts.filter((a) => a.learner_id === learnerId)
  const completed = new Set(
    missions
      .filter((m) => m.learner_id === learnerId && m.status === 'complete')
      .map((m) => m.module_key),
  )
  return [...chapters]
    .sort((a, b) => a.order_index - b.order_index)
    .map((chapter) => {
      const chapterRows = ownAttempts.filter((a) => a.chapter_key === chapter.chapter_key)
      return {
        ...chapter,
        pre: aggregatePhase(chapterRows, 'pre'),
        post: aggregatePhase(chapterRows, 'post'),
        mission_complete: completed.has(chapter.chapter_key),
      }
    })
}

/** The learner's passed-chapter count (the CAI course progress). */
export function chapterCourseProgress(
  chapters: readonly ChapterProgress[],
): { completed: number; total: number; progressPct: number } | null {
  if (chapters.length === 0) return null
  const completed = chapters.filter((c) => c.post.passed).length
  return {
    completed,
    total: chapters.length,
    progressPct: Math.round((completed / chapters.length) * 100),
  }
}

/** The current chapter: the first chapter whose post-test has not passed.
 * Null means every visible chapter is cleared (the Final Test is next). */
export function currentChapter(chapters: readonly ChapterProgress[]): ChapterProgress | null {
  return chapters.find((c) => !c.post.passed) ?? null
}

/** The Final Test aggregate from the first-attempt row + the retry stream. */
export function buildFinalTestProgress(
  responses: readonly FinalTestResponseRow[],
  retries: readonly FinalTestRetryRow[],
  learnerId?: string,
): FinalTestProgress | null {
  const ownResponses = learnerId
    ? responses.filter((r) => r.learner_id === learnerId)
    : [...responses]
  const ownRetries = learnerId
    ? retries.filter((r) => String(r.learner_id) === learnerId)
    : [...retries]
  if (ownResponses.length === 0 && ownRetries.length === 0) return null
  const submitted = ownResponses.filter((r) => r.submitted_at !== null)
  const submittedRetries = ownRetries.filter((r) => r.submitted_at !== null)
  const scores = [
    ...submitted.map((r) => r.score).filter((s): s is number => s !== null),
    ...submittedRetries.map((r) => r.score).filter((s): s is number => s !== null),
  ]
  const first = submitted.length > 0 ? submitted[0]!.score : null
  return {
    completed: submitted.length + submittedRetries.length > 0,
    first_score: first,
    best_score: scores.length > 0 ? Math.max(...scores) : null,
    attempts: submitted.length + submittedRetries.length,
    instrument_version: submitted.length > 0 ? submitted[0]!.instrument_version : null,
  }
}

/** The next-action kinds the dashboard and course map speak. */
export type LoopActionKind =
  | 'consent'
  | 'global-pretest'
  | 'chapter-pretest'
  | 'chapter-lessons'
  | 'chapter-posttest'
  | 'final-test'
  | 'survey'
  | 'done'
  | 'course'
  | 'unavailable'

/** The typed destinations, structurally mirroring the routing pathnames. */
export type LoopHref =
  | '/'
  | '/pre-test'
  | '/post-test'
  | '/survey'
  | '/course'
  | { pathname: '/course/[moduleKey]'; params: { moduleKey: string } }
  | {
      pathname: '/course/[moduleKey]/chapter-test/[phase]'
      params: { moduleKey: string; phase: 'pre' | 'post' }
    }

export interface LoopAction {
  kind: LoopActionKind
  href: LoopHref | null
  /** A `home.loop.*` copy key; the page interpolates the chapter title. */
  labelKey: string
  explanationKey?: string
  chapterKey?: string
  chapterOrder?: number
  chapterTitleTh?: string
  chapterTitleEn?: string
}

export interface LoopState {
  gateOk: boolean
  consent: boolean
  override: boolean
  globalPretestSubmitted: boolean
  chapters: readonly ChapterProgress[]
  finalTest: FinalTestProgress | null
  surveyUnlocked: boolean
  surveySubmitted: boolean
}

const chapterCopy = (chapter: ChapterProgress) => ({
  chapterKey: chapter.chapter_key,
  chapterOrder: chapter.order_index,
  chapterTitleTh: chapter.title_th,
  chapterTitleEn: chapter.title_en,
})

/**
 * The ONE primary next action for every loop state. The gate chain is the
 * shipped one; after the global pre-test the chapter spine decides. A locked
 * chapter (which the server would deny anyway) points at the map rather than
 * a fake test. After all nine chapters, the Final Test, then the Survey.
 */
export function deriveLoopNextAction(state: LoopState): LoopAction | null {
  if (!state.gateOk) return null
  if (!state.consent && !state.override) {
    return {
      kind: 'consent',
      href: '/',
      labelKey: 'loop.consentCta',
      explanationKey: 'loop.consent',
    }
  }
  if (!state.globalPretestSubmitted && !state.override) {
    return {
      kind: 'global-pretest',
      href: '/pre-test',
      labelKey: 'loop.globalPretestCta',
      explanationKey: 'loop.globalPretest',
    }
  }
  if (state.chapters.length === 0) {
    return {
      kind: 'course',
      href: '/course',
      labelKey: 'loop.courseCta',
      explanationKey: 'loop.course',
    }
  }

  const chapter = currentChapter(state.chapters)
  if (chapter) {
    const chapterData = chapterCopy(chapter)
    if (!chapter.open) {
      return {
        kind: 'course',
        href: '/course',
        labelKey: 'loop.courseCta',
        explanationKey: 'loop.chapterLocked',
        ...chapterData,
      }
    }
    if (!chapter.pre.submitted) {
      return {
        kind: 'chapter-pretest',
        href: {
          pathname: '/course/[moduleKey]/chapter-test/[phase]',
          params: { moduleKey: chapter.chapter_key, phase: 'pre' },
        },
        labelKey: 'loop.chapterPretestCta',
        explanationKey: 'loop.chapterPretest',
        ...chapterData,
      }
    }
    if (!chapter.mission_complete) {
      return {
        kind: 'chapter-lessons',
        href: {
          pathname: '/course/[moduleKey]',
          params: { moduleKey: chapter.chapter_key },
        },
        labelKey: 'loop.chapterLessonsCta',
        explanationKey: 'loop.chapterLessons',
        ...chapterData,
      }
    }
    return {
      kind: 'chapter-posttest',
      href: {
        pathname: '/course/[moduleKey]/chapter-test/[phase]',
        params: { moduleKey: chapter.chapter_key, phase: 'post' },
      },
      labelKey: 'loop.chapterPosttestCta',
      explanationKey: 'loop.chapterPosttest',
      ...chapterData,
    }
  }

  if (!state.finalTest || !state.finalTest.completed) {
    return {
      kind: 'final-test',
      href: '/post-test',
      labelKey: 'loop.finalTestCta',
      explanationKey: 'loop.finalTest',
    }
  }
  if (!state.surveySubmitted) {
    return {
      kind: 'survey',
      href: '/survey',
      labelKey: 'loop.surveyCta',
      explanationKey: state.surveyUnlocked ? 'loop.survey' : 'loop.surveyLocked',
    }
  }
  return {
    kind: 'done',
    href: null,
    labelKey: 'loop.doneCta',
    explanationKey: 'loop.done',
  }
}

/** A short status line for one chapter (the card/list surfaces print it). */
export function chapterStatusText(
  chapter: ChapterProgress,
  messages: {
    pre: string
    post: string
    mission: string
    missionDone: string
    missionPending: string
    notStarted: string
    passed: string
    notPassed: string
  },
): string {
  const phase = (p: PhaseProgress, label: string) =>
    p.submitted
      ? `${label} ${p.best_score ?? 0}/${p.item_count}${p.passed ? ` (${messages.passed})` : ''}`
      : `${label} ${messages.notStarted}`
  return [
    phase(chapter.pre, messages.pre),
    phase(chapter.post, messages.post),
    `${messages.mission}: ${chapter.mission_complete ? messages.missionDone : messages.missionPending}`,
  ].join(' · ')
}

/** One learner row of the Teacher/Admin chapter-progress view. */
export interface LearnerChapterProgress {
  learner_id: string
  student_id: string
  full_name: string
  chapters: ChapterProgress[]
  cleared: number
  total: number
  current: ChapterProgress | null
  final_test: FinalTestProgress | null
}

/** The whole roster, one row per learner, with the same pure chapter state
 * the learner's own map shows. No review queue, no practical progress. */
export function buildRosterProgress(
  learners: readonly { id: string; student_id: string; full_name: string }[],
  chapters: readonly ChapterMeta[],
  attempts: readonly ChapterAttemptRow[],
  missions: readonly MissionCompletionRow[],
  responses: readonly FinalTestResponseRow[] = [],
  retries: readonly FinalTestRetryRow[] = [],
): LearnerChapterProgress[] {
  return learners.map((learner) => {
    const learnerChapters = buildChapterProgress(learner.id, chapters, attempts, missions)
    return {
      learner_id: learner.id,
      student_id: learner.student_id,
      full_name: learner.full_name,
      chapters: learnerChapters,
      cleared: learnerChapters.filter((c) => c.post.passed).length,
      total: learnerChapters.length,
      current: currentChapter(learnerChapters),
      final_test: buildFinalTestProgress(responses, retries, learner.id),
    }
  })
}
