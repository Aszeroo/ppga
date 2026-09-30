import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * The session client factory for a review call (the same pattern as
 * `lib/sup/xp.ts`). The user's JWT (from the request's cookie jar) is the
 * only authority; we do NOT use the service-role key (it bypasses RLS).
 * Missing env yields `null` so the caller shows "not-configured" instead of
 * crashing. The jar is resolved before the (sync) storage callback is built
 * (`next/headers` is async).
 */
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

const moduleKeySchema = z.string().regex(/^module-(?:0[1-9]|10)$/)

// ─── queue ───────────────────────────────────────────────────────────────────

export async function readReviewQueueViaRpc(
  moduleKey: string,
): Promise<ReviewQueueState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { status: 'denied', detail: 'module key not in the practical shape (module-08|09|10|11)' }

  const { data, error } = await sup.rpc('ppg_review_queue', { p_mission_id: moduleKey } as never)

  if (error) {
    if (
      /permission_denied|denied_role|denied_caller/.test(error.message.toLowerCase())
    )
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  const result = data as Array<{
    learner_id: string
    learner_name: string
    student_id: string
    mission_id: string
    submission_seq: number
    reflection: string
  }> | null

  if (!result) return { status: 'empty', detail: 'no queue' }

  return {
    status: 'ok',
    queue: result.map((row) => ({
      learner_id: row.learner_id,
      learner_name: row.learner_name,
      student_id: row.student_id,
      mission_id: row.mission_id,
      submission_seq: row.submission_seq,
      reflection: row.reflection,
    })),
  }
}

// ─── submit ──────────────────────────────────────────────────────────────────

export async function submitReviewViaRpc(
  moduleKey: string,
  submissionSeq: number,
  scores: {
    content_structure: number
    text_formatting: number
    images_visual: number
    slide_design: number
    tool_usage: number
    creativity: number
    completeness: number
  },
  decision: 'approved' | 'needs_improvement',
  feedbackTh: string | null,
  feedbackEn: string | null
): Promise<SubmitReviewState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { status: 'denied', detail: 'module key not in the practical shape' }

  // Validate scores 1-5
  const scoreValues = Object.values(scores)
  for (const score of scoreValues) {
    if (!Number.isInteger(score) || score < 1 || score > 5)
      return { status: 'denied', detail: 'scores must be integers 1-5' }
  }

  if (!['approved', 'needs_improvement'].includes(decision))
    return { status: 'denied', detail: 'decision must be approved or needs_improvement' }

  // the SERVER-side scores jsonb carries the migration's OWN criterion keys
  // (`powerpoint_tool_usage` — lib's `tool_usage` is the TS-side alias only)
  const { data, error } = await sup.rpc('ppg_submit_review', {
    p_mission_id: moduleKey,
    p_submission_seq: submissionSeq,
    p_scores: {
      content_structure: scores.content_structure,
      text_formatting: scores.text_formatting,
      images_visual: scores.images_visual,
      slide_design: scores.slide_design,
      powerpoint_tool_usage: scores.tool_usage,
      creativity: scores.creativity,
      completeness: scores.completeness,
    },
    p_decision: decision,
    p_feedback_th: feedbackTh,
    p_feedback_en: feedbackEn,
  } as never)

  if (error) {
    if (
      /permission_denied|denied_role|denied_caller/.test(error.message.toLowerCase())
    )
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  const result = data as {
    mission_id: string
    submission_seq: number
    decision: string
    total_score: number
    xp_granted: number
    badge_granted: boolean
    module_badge_key: string | null
  } | null

  if (!result) return { status: 'error', detail: 'empty submit result' }

  return {
    status: 'ok',
    mission_id: result.mission_id,
    submission_seq: result.submission_seq,
    decision: result.decision as 'approved' | 'needs_improvement',
    total_score: result.total_score,
    xp_granted: result.xp_granted,
    badge_granted: result.badge_granted,
    module_badge_key: result.module_badge_key,
  }
}

// ─── criteria ─────────────────────────────────────────────────────────────────

export async function readRubricCriteriaViaRpc(): Promise<RubricCriteriaState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup.rpc('ppg_read_rubric_criteria' as never)

  if (error) return { status: 'error', detail: error.message }

  const result = data as {
    criteria: Array<{
      criterion_key: string
      ordinal: number
      label_th: string
      label_en: string
    }>
    descriptors: Array<{
      criterion_key: string
      score_band: number
      descriptor_th: string
      descriptor_en: string
    }>
  }

  return {
    status: 'ok',
    criteria: result.criteria.map((c) => ({
      criterion_key: c.criterion_key,
      ordinal: c.ordinal,
      label_th: c.label_th,
      label_en: c.label_en,
    })),
    descriptors: result.descriptors.map((d) => ({
      criterion_key: d.criterion_key,
      score_band: d.score_band,
      descriptor_th: d.descriptor_th,
      descriptor_en: d.descriptor_en,
    })),
  }
}

// ─── history ─────────────────────────────────────────────────────────────────

export async function readReviewHistoryViaRpc(
  moduleKey: string,
): Promise<ReviewHistoryState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { status: 'denied', detail: 'module key not in the practical shape' }

  const { data, error } = await sup.rpc('ppg_review_history', { p_mission_id: moduleKey } as never)

  if (error) {
    if (
      /permission_denied|denied_role|denied_caller/.test(error.message.toLowerCase())
    )
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  const result = data as {
    history: Array<{
      mission_id: string
      submission_seq: number
      scores: {
        content_structure: number
        text_formatting: number
        images_visual: number
        slide_design: number
        powerpoint_tool_usage: number
        creativity: number
        completeness: number
      }
      total_score: number
      decision: string
      feedback_th: string | null
      feedback_en: string | null
      teacher_id: string
      created_at: string
    }>
  } | null

  if (!result) return { status: 'empty', detail: 'no history' }

  return {
    status: 'ok',
    history: result.history.map((row) => ({
      mission_id: row.mission_id,
      submission_seq: row.submission_seq,
      scores: {
        content_structure: row.scores.content_structure,
        text_formatting: row.scores.text_formatting,
        images_visual: row.scores.images_visual,
        slide_design: row.scores.slide_design,
        tool_usage: row.scores.powerpoint_tool_usage,
        creativity: row.scores.creativity,
        completeness: row.scores.completeness,
      },
      total_score: row.total_score,
      decision: row.decision as 'approved' | 'needs_improvement',
      feedback_th: row.feedback_th,
      feedback_en: row.feedback_en,
      teacher_id: row.teacher_id,
      created_at: row.created_at,
    })),
  }
}

// ─── latest ───────────────────────────────────────────────────────────────────

export async function readLatestReviewViaRpc(
  moduleKey: string,
): Promise<LatestReviewState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!moduleKeySchema.safeParse(moduleKey).success)
    return { status: 'denied', detail: 'module key not in the practical shape (module-08|09|10|11)' }

  const { data, error } = await sup.rpc('ppg_read_latest_review', { p_mission_id: moduleKey } as never)

  if (error) {
    if (
      /permission_denied|denied_role|denied_caller/.test(error.message.toLowerCase())
    )
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  const result = data as {
    latest: {
      submission_seq: number
      scores: {
        content_structure: number
        text_formatting: number
        images_visual: number
        slide_design: number
        powerpoint_tool_usage: number
        creativity: number
        completeness: number
      }
      total_score: number
      decision: string
      feedback_th: string | null
      feedback_en: string | null
    }
    history: Array<{
      mission_id: string
      submission_seq: number
      scores: {
        content_structure: number
        text_formatting: number
        images_visual: number
        slide_design: number
        powerpoint_tool_usage: number
        creativity: number
        completeness: number
      }
      total_score: number
      decision: string
      feedback_th: string | null
      feedback_en: string | null
      teacher_id: string
      created_at: string
    }>
  } | null

  if (!result) return { status: 'empty', detail: 'no review yet' }

  return {
    status: 'ok',
    latest: {
      submission_seq: result.latest.submission_seq,
      scores: {
        content_structure: result.latest.scores.content_structure,
        text_formatting: result.latest.scores.text_formatting,
        images_visual: result.latest.scores.images_visual,
        slide_design: result.latest.scores.slide_design,
        tool_usage: result.latest.scores.powerpoint_tool_usage,
        creativity: result.latest.scores.creativity,
        completeness: result.latest.scores.completeness,
      },
      total_score: result.latest.total_score,
      decision: result.latest.decision as 'approved' | 'needs_improvement',
      feedback_th: result.latest.feedback_th,
      feedback_en: result.latest.feedback_en,
    },
    history: result.history.map((row) => ({
      mission_id: row.mission_id,
      submission_seq: row.submission_seq,
      scores: {
        content_structure: row.scores.content_structure,
        text_formatting: row.scores.text_formatting,
        images_visual: row.scores.images_visual,
        slide_design: row.scores.slide_design,
        tool_usage: row.scores.powerpoint_tool_usage,
        creativity: row.scores.creativity,
        completeness: row.scores.completeness,
      },
      total_score: row.total_score,
      decision: row.decision as 'approved' | 'needs_improvement',
      feedback_th: row.feedback_th,
      feedback_en: row.feedback_en,
      teacher_id: row.teacher_id,
      created_at: row.created_at,
    })),
  }
}

// ─── types ───────────────────────────────────────────────────────────────────

export type ReviewQueueState =
  | { status: 'ok'; queue: Array<{
      learner_id: string
      learner_name: string
      student_id: string
      mission_id: string
      submission_seq: number
      reflection: string
    }> }
  | { status: 'empty'; detail: string }
  | { status: 'error'; detail: string }
  | { status: 'denied'; detail: string }
  | { status: 'unauthorized'; detail: string }
  | { status: 'not-configured'; detail: string }

export type SubmitReviewState =
  | { status: 'ok'; mission_id: string; submission_seq: number; decision: 'approved' | 'needs_improvement'; total_score: number; xp_granted: number; badge_granted: boolean; module_badge_key: string | null }
  | { status: 'error'; detail: string }
  | { status: 'denied'; detail: string }
  | { status: 'unauthorized'; detail: string }
  | { status: 'not-configured'; detail: string }

export type RubricCriteriaState =
  | { status: 'ok'; criteria: Array<{ criterion_key: string; ordinal: number; label_th: string; label_en: string }>; descriptors: Array<{ criterion_key: string; score_band: number; descriptor_th: string; descriptor_en: string }> }
  | { status: 'error'; detail: string }
  | { status: 'unauthorized'; detail: string }
  | { status: 'not-configured'; detail: string }

export type ReviewHistoryState =
  | { status: 'ok'; history: Array<{
      mission_id: string
      submission_seq: number
      scores: {
        content_structure: number
        text_formatting: number
        images_visual: number
        slide_design: number
        tool_usage: number
        creativity: number
        completeness: number
      }
      total_score: number
      decision: 'approved' | 'needs_improvement'
      feedback_th: string | null
      feedback_en: string | null
      teacher_id: string
      created_at: string
    }> }
  | { status: 'empty'; detail: string }
  | { status: 'error'; detail: string }
  | { status: 'denied'; detail: string }
  | { status: 'unauthorized'; detail: string }
  | { status: 'not-configured'; detail: string }

export type LatestReviewState =
  | { status: 'ok'; latest: {
      submission_seq: number
      scores: {
        content_structure: number
        text_formatting: number
        images_visual: number
        slide_design: number
        tool_usage: number
        creativity: number
        completeness: number
      }
      total_score: number
      decision: 'approved' | 'needs_improvement'
      feedback_th: string | null
      feedback_en: string | null
    }; history: Array<{
      mission_id: string
      submission_seq: number
      scores: {
        content_structure: number
        text_formatting: number
        images_visual: number
        slide_design: number
        tool_usage: number
        creativity: number
        completeness: number
      }
      total_score: number
      decision: 'approved' | 'needs_improvement'
      feedback_th: string | null
      feedback_en: string | null
      teacher_id: string
      created_at: string
    }> }
  | { status: 'empty'; detail: string }
  | { status: 'error'; detail: string }
  | { status: 'denied'; detail: string }
  | { status: 'unauthorized'; detail: string }
  | { status: 'not-configured'; detail: string }
