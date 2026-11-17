import 'server-only'

import { createSupaSessionClient } from './sessionClient'

import type {
  ChapterAttemptRow,
  MissionCompletionRow,
  FinalTestResponseRow,
  FinalTestRetryRow,
} from '../chapterProgress'

/**
 * PPGA #86: the CAI loop's read-only table reads. Every read rides the
 * caller's session JWT, so the shipped RLS policies decide the rows: a
 * learner reads only their own chapter attempts, Mission completions and
 * Final Test responses; a teacher/admin reads the cohort (the progress view
 * filters per learner in the pure layer). No service-role key, no write.
 */
export interface ChapterMetaRow {
  module_key: string
  order_index: number
  title_th: string
  title_en: string
  course_key: string
}

export interface LearnerProfileRow {
  id: string
  student_id: string
  full_name: string
  role: string
}

export interface ChapterProgressData {
  status: 'ok' | 'error' | 'not-configured' | 'unauthorized'
  detail?: string
  uid?: string
  attempts?: ChapterAttemptRow[]
  missions?: MissionCompletionRow[]
  responses?: FinalTestResponseRow[]
  retries?: FinalTestRetryRow[]
  modules?: ChapterMetaRow[]
  learners?: LearnerProfileRow[]
}


export interface ChapterProgressReadOptions {
  /** A teacher/admin view filters every read to one learner; the learner's
   * own RLS already scopes the rows. */
  learnerId?: string
  /** The teacher/admin roster view needs the learner list + the Final Test
   * attempt stream (a learner's own state comes from `ppg_final_test_state`). */
  roster?: boolean
}

/**
 * Every row the chapter views need, in one call. A failed read returns the
 * error state, never a fabricated empty list; the page speaks the state.
 */
export async function readChapterProgressData(
  opts: ChapterProgressReadOptions = {},
): Promise<ChapterProgressData> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  const uid = session?.session?.user.id
  if (!session || !session.session || !uid) return { status: 'unauthorized', detail: 'no session' }

  let attemptsQuery = sup
    .from('ppg_chapter_test_attempts')
    .select('learner_id, chapter_key, phase, attempt_seq, score, item_count, submitted_at')
    .order('chapter_key', { ascending: true })
    .order('attempt_seq', { ascending: true })
  let missionsQuery = sup
    .from('ppg_module_missions')
    .select('learner_id, module_key, status')
    .order('module_key', { ascending: true })
  if (opts.learnerId) {
    attemptsQuery = attemptsQuery.eq('learner_id', opts.learnerId)
    missionsQuery = missionsQuery.eq('learner_id', opts.learnerId)
  }

  // Independent reads: one round-trip wave, not two.
  const [attempts, missions] = await Promise.all([attemptsQuery, missionsQuery])

  if (attempts.error || missions.error) {
    return {
      status: 'error',
      detail: attempts.error?.message || missions.error?.message || 'chapter progress read failed',
    }
  }

  const result: ChapterProgressData = {
    status: 'ok',
    uid,
    attempts: (attempts.data ?? []) as ChapterAttemptRow[],
    missions: (missions.data ?? []) as MissionCompletionRow[],
  }

  if (opts.roster) {
    const [modules, learners, responses, retries] = await Promise.all([
      sup
        .from('ppg_modules')
        .select('module_key, order_index, title_th, title_en, course_key')
        .like('module_key', 'chapter-%')
        .order('order_index', { ascending: true }),
      sup
        .from('ppg_profiles')
        .select('id, student_id, full_name, role')
        .eq('role', 'learner')
        .order('student_id', { ascending: true }),
      sup
        .from('ppg_posttest_responses')
        .select('learner_id, instrument_version, score, submitted_at'),
      sup
        .from('ppg_posttest_retry_attempts')
        .select('learner_id, attempt_no, score, submitted_at'),
    ])
    for (const q of [modules, learners, responses, retries]) {
      if (q.error) return { status: 'error', detail: q.error.message }
    }
    result.modules = (modules.data ?? []) as ChapterMetaRow[]
    result.learners = (learners.data ?? []) as LearnerProfileRow[]
    result.responses = (responses.data ?? []) as FinalTestResponseRow[]
    result.retries = (retries.data ?? []) as FinalTestRetryRow[]
  }

  return result
}
