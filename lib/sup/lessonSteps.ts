import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'

import { contentKeySchema } from './curriculum'
import type { LessonStepRow } from '../lessonSteps'

/**
 * PPGA #75 CAI lesson-step server module: the read (steps a SEE-ABLE Lesson
 * shows) and the formative mini-check grade. Both run on the request's own
 * user JWT; the browser never reaches the service-role key and never sees
 * the answer key. The read RPC projects prompts + options only; the grade
 * RPC compares server-side and returns correctness + explanation only.
 *
 * This module deliberately does not touch `lib/sup/xp.ts` or the Self-Check
 * submit path: a mini-check is formative, so it cannot gate progression or
 * award XP.
 */

export type LessonStepsStatus =
  | 'ok'
  | 'empty'
  | 'error'
  | 'denied'
  | 'not-configured'
  | 'unauthorized'

export interface LessonStepsState {
  status: LessonStepsStatus
  detail?: string
  steps?: LessonStepRow[]
}

export interface MiniCheckGradeState {
  ok: boolean
  detail?: string
  correct?: boolean
  explanation_th?: string
  explanation_en?: string
}

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

/**
 * The step read: the caller's JWT decides visibility in the definer RPC
 * (published + gate + module open for a learner; every row for
 * teacher/admin). A locked/draft Lesson returns `[]` server-side; the page
 * then falls back to the legacy prose adapter.
 */
export async function readLessonStepsViaRpc(lessonKey: string): Promise<LessonStepsState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!contentKeySchema.safeParse(lessonKey).success)
    return { status: 'denied', detail: 'lesson key not in the seeded shape' }

  const { data, error } = await sup.rpc('ppg_lesson_steps', {
    p_lesson_key: lessonKey,
  } as never)

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  if (!data || !Array.isArray(data) || data.length === 0)
    return { status: 'empty', detail: 'no step rows (the lesson is locked, unseen, or legacy)' }
  return { status: 'ok', steps: data as LessonStepRow[] }
}

/**
 * Grade one mini-check: the RPC compares the chosen option server-side and
 * returns correctness + the bilingual explanation. Nothing is written by
 * this call (no attempt, no XP, no unlock), and no `is_correct`/answer-key
 * field is ever returned.
 */
export async function gradeMiniCheckViaRpc(
  lessonKey: string,
  orderIndex: number,
  optionKey: string,
): Promise<MiniCheckGradeState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  if (!contentKeySchema.safeParse(lessonKey).success)
    return { ok: false, detail: 'lesson key not in the seeded shape' }
  if (!Number.isInteger(orderIndex) || orderIndex < 1 || orderIndex > 20)
    return { ok: false, detail: 'order index out of range' }
  if (!/^[a-d]$/.test(optionKey))
    return { ok: false, detail: 'option key not in the seeded shape' }

  const { data, error } = await sup.rpc('ppg_grade_mini_check', {
    p_lesson_key: lessonKey,
    p_order_index: orderIndex,
    p_option_key: optionKey,
  } as never)

  if (error) {
    const lower = error.message.toLowerCase()
    for (const code of ['check_not_found', 'option_not_found', 'permission_denied'])
      if (lower.includes(code)) return { ok: false, detail: `${code}: ${error.message}` }
    return { ok: false, detail: error.message }
  }

  if (!data || typeof data !== 'object') return { ok: false, detail: 'no grade returned' }
  const row = data as Record<string, unknown>
  return {
    ok: true,
    correct: row.correct === true,
    explanation_th: typeof row.explanation_th === 'string' ? row.explanation_th : undefined,
    explanation_en: typeof row.explanation_en === 'string' ? row.explanation_en : undefined,
  }
}
