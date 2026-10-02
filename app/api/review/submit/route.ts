import { NextRequest, NextResponse } from 'next/server'

import { submitReviewViaRpc } from '../../../../lib/sup/reviews'

/**
 * Ticket #14 The Teacher's review: the 7 criterion scores 1–5 each (a 0/6/8
 * NEVER rides — `rubric_score_denied`; the total 7–35 the SERVER computes,
 * never a client count), the decision approved|needs_improvement + the written
 * feedback (bilingual), ONE row PER round (the PK denies a second INSERT — never
 * an overwrite; ADR-0002). One transaction: the review columns ride the definer
 * UPDATE under `ppg.rerun`, the status moves via #13's transition, on the
 * APPROVAL the +150 XP lands idempotent (the ledger PK — the first approval
 * ONCE; a re-approval NEVER conflicts, never a second +150; xp_granted says what
 * landed) + the module badge (the award PK ONCE). A learner/stranger smuggle
 * the call as denied_role; a missing round as submission_missing; a reviewed
 * round as not_pending; the scores NEVER ride the leaderboard (ADR-0001).
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // the teacher's review form posts form-encoded (the native submit; the
  // `score_<criterion_key>` radios + the moduleKey/submissionSeq hidden
  // fields); the JSON UIs may post JSON; both ride the same RPC gate.
  const ct = req.headers.get('content-type') ?? ''

  let moduleKey: unknown
  let submissionSeq: unknown
  let decision: unknown
  let feedbackTh: unknown
  let feedbackEn: unknown
  // PPGA #18 finding #5: the review row is (learner, mission, round) — the
  // queue's own row knows its owner and the review screen carries that uuid
  // through the form; without it the RPC could resolve a stranger's same round.
  let learnerId: unknown
  let scores: Record<string, unknown> | null = null

  if (ct.includes('application/json')) {
    const body = await req
      .json()
      .catch(() => ({}) as never)
    moduleKey = body.moduleKey
    submissionSeq = body.submissionSeq
    decision = body.decision
    feedbackTh = body.feedbackTh
    feedbackEn = body.feedbackEn
    learnerId = body.learnerId
    scores = (body.scores as Record<string, unknown> | undefined) ?? null
  } else {
    const form = await req.formData().catch(() => new FormData() as never)
    moduleKey = form.get('moduleKey')
    submissionSeq = form.get('submissionSeq')
    decision = form.get('decision')
    feedbackTh = form.get('feedbackTh')
    feedbackEn = form.get('feedbackEn')
    learnerId = form.get('learnerId')
    // the form's radios carry the DB criterion keys (ppg_rubric_criteria —
    // `powerpoint_tool_usage` among them); lib's `tool_usage` is the TS-side
    // alias the RPC mapping already speaks.
    const pick = (key: string) => Number(form.get(`score_${key}`))
    scores = {
      content_structure: pick('content_structure'),
      text_formatting: pick('text_formatting'),
      images_visual: pick('images_visual'),
      slide_design: pick('slide_design'),
      tool_usage: pick('powerpoint_tool_usage'),
      creativity: pick('creativity'),
      completeness: pick('completeness'),
    }
  }

  if (
    !moduleKey ||
    submissionSeq === undefined ||
    submissionSeq === null ||
    submissionSeq === '' ||
    !scores ||
    !decision ||
    feedbackTh === undefined ||
    feedbackTh === null ||
    feedbackEn === undefined ||
    feedbackEn === null
  ) {
    return NextResponse.json({
      status: 'error',
      detail: 'moduleKey/submissionSeq/scores/decision/feedbackTh/feedbackEn missing',
    })
  }

  const result = await submitReviewViaRpc(
    String(moduleKey),
    Number(submissionSeq),
    {
      content_structure: Number(scores.content_structure),
      text_formatting: Number(scores.text_formatting),
      images_visual: Number(scores.images_visual),
      slide_design: Number(scores.slide_design),
      // the JSON path may carry either alias — the DB key or lib's alias.
      tool_usage: Number(scores.tool_usage ?? scores.powerpoint_tool_usage),
      creativity: Number(scores.creativity),
      completeness: Number(scores.completeness),
    },
    decision as 'approved' | 'needs_improvement',
    String(feedbackTh),
    String(feedbackEn),
    typeof learnerId === 'string' && learnerId.length > 0 ? learnerId : undefined
  )
  return NextResponse.json(result)
}
