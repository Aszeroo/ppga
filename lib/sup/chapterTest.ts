import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

import { isChapterKey, isChapterTestPhase, type ChapterTestPhase } from '../chapterTest'

/**
 * Ticket #74 Chapter pre/post-test server module: the screen state (both
 * banks, the caller's attempt scores, per-question feedback, the local
 * next-chapter unlock) and the submit both run here on the request's user
 * JWT. The browser never reaches the service-role key and never sees the
 * answer key: the read RPC returns prompts + options only, and the submit
 * RPC scores server-side. The pre-test is one attempt; the post-test allows
 * retries. The FIRST post-test score stays the research measure and the BEST
 * score decides the 70% unlock.
 */

export const chapterTestSubmitSchema = z
  .object({
    chapter_key: z.string().refine(isChapterKey, 'chapter key must look like chapter-NN'),
    phase: z.enum(['pre', 'post']),
    language: z.enum(['th', 'en']),
    // The RPC reads `p_answers ->> order_index`; the payload must stay a
    // JSON OBJECT end to end (the #18 seam lesson).
    answers: z.record(z.string(), z.string()).default({}),
  })
  .strict()

export interface ChapterTestQuestion {
  order_index: number
  objective_key: string
  prompt_th: string
  prompt_en: string
  options: Array<{ option_key: string; option_th: string; option_en: string }>
}

export interface ChapterTestFeedback {
  order_index: number
  chosen: string
  correct: boolean
}

export interface ChapterTestPhaseState {
  questions: ChapterTestQuestion[]
  total: number
  attempts: number
  first_score: number | null
  best_score: number | null
  last_score: number | null
  submitted_at: string | null
  feedback: ChapterTestFeedback[]
}

export interface ChapterTestState {
  status: 'ok' | 'empty' | 'error' | 'denied' | 'not-configured' | 'unauthorized'
  detail?: string
  chapterKey?: string
  courseKey?: string
  title_th?: string
  title_en?: string
  pre?: ChapterTestPhaseState
  post?: ChapterTestPhaseState
  nextChapterKey?: string
  nextUnlocked?: boolean
}

export interface ChapterTestSubmitResult {
  ok: boolean
  detail?: string
  chapterKey?: string
  phase?: ChapterTestPhase
  attemptSeq?: number
  score?: number
  total?: number
  firstScore?: number | null
  bestScore?: number | null
  passed?: boolean
  nextChapterKey?: string
  nextUnlocked?: boolean
  feedback?: ChapterTestFeedback[]
}

/** The session client factory (the shipped #8/#15 pattern). Missing env
 * yields null so the page shows "not-configured" instead of crashing. */
async function createSupaSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY
  if (!url || !anonKey) return null

  const jar = await cookies()
  return createClient(url, anonKey, {
    auth: {
      storageKey: 'ppga_session',
      storage: {
        isServer: true as const,
        getItem: (key: string) => jar.get(key)?.value ?? null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    },
  })
}

function mapError(message: string): { status: 'denied' | 'error'; detail: string } {
  const m = message.toLowerCase()
  if (
    m.includes('gate_closed') ||
    m.includes('chapter_denied') ||
    m.includes('chapter_missing') ||
    m.includes('permission_denied')
  )
    return { status: 'denied', detail: message }
  return { status: 'error', detail: message }
}

/**
 * The Chapter test screen state: learner-gated server-side (the RPC speaks
 * `gate_closed`/`chapter_denied`), both banks WITHOUT the key, the caller's
 * attempt scores and the latest per-question feedback. An unknown chapter or
 * a non-active chapter reaches `denied`, never a smuggled bank.
 */
export async function readChapterTestStateViaRpc(chapterKey: string): Promise<ChapterTestState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!isChapterKey(chapterKey))
    return { status: 'denied', detail: 'chapter key not in the seeded shape (chapter-NN)' }

  const { data, error } = await sup.rpc('ppg_chapter_test_state', {
    p_chapter_key: chapterKey,
  } as never)

  if (error) return mapError(error.message)
  if (!data || typeof data !== 'object') return { status: 'empty', detail: 'no chapter state' }

  const row = data as Record<string, unknown>
  const phase = (value: unknown): ChapterTestPhaseState | undefined => {
    if (!value || typeof value !== 'object') return undefined
    return value as ChapterTestPhaseState
  }
  return {
    status: 'ok',
    chapterKey: row.chapter_key as string,
    courseKey: row.course_key as string,
    title_th: row.title_th as string,
    title_en: row.title_en as string,
    pre: phase(row.pre),
    post: phase(row.post),
    nextChapterKey: row.next_chapter_key as string,
    nextUnlocked: row.next_unlocked === true,
  }
}

/**
 * The submit: posts the caller's answers to the definer RPC. The score, the
 * attempt sequence and the 70% pass are all computed server-side; the
 * response carries per-question right/wrong only, never the answer key.
 */
export async function submitChapterTestViaRpc(
  chapterKey: string,
  phase: ChapterTestPhase,
  answers: Record<string, string>,
  language: 'th' | 'en',
): Promise<ChapterTestSubmitResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  if (!isChapterKey(chapterKey) || !isChapterTestPhase(phase))
    return { ok: false, detail: 'chapter/phase not in the seeded shape' }

  const { data, error } = await sup.rpc('ppg_chapter_test_submit', {
    p_chapter_key: chapterKey,
    p_phase: phase,
    p_language: language,
    p_answers: answers,
  } as never)

  if (error) {
    const lower = error.message.toLowerCase()
    for (const code of [
      'gate_closed',
      'pre_already_submitted',
      'chapter_missing',
      'chapter_denied',
      'phase_denied',
      'language_denied',
      'answers_denied',
      'bank_missing',
      'permission_denied',
    ])
      if (lower.includes(code)) return { ok: false, detail: `${code}: ${error.message}` }
    return { ok: false, detail: error.message }
  }

  if (!data || typeof data !== 'object') return { ok: false, detail: 'empty submit result' }
  const row = data as Record<string, unknown>
  return {
    ok: true,
    chapterKey: row.chapter_key as string,
    phase: row.phase as ChapterTestPhase,
    attemptSeq: typeof row.attempt_seq === 'number' ? row.attempt_seq : undefined,
    score: typeof row.score === 'number' ? row.score : undefined,
    total: typeof row.total === 'number' ? row.total : undefined,
    firstScore: typeof row.first_score === 'number' ? row.first_score : null,
    bestScore: typeof row.best_score === 'number' ? row.best_score : null,
    passed: row.passed === true,
    nextChapterKey: row.next_chapter_key as string,
    nextUnlocked: row.next_unlocked === true,
    feedback: Array.isArray(row.feedback) ? (row.feedback as ChapterTestFeedback[]) : [],
  }
}
