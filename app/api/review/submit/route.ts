import { NextRequest, NextResponse } from 'next/server'

import { submitReviewViaRpc } from '../../../../lib/sup/reviews'

/**
 * Ticket #14 The Teacher's review: the 7 criterion scores 1–5 each (a 0/6/8
 * NEVER rides — `rubric_score_denied`; the total 7–35 the SERVER computes,
 * never a client count), the decision approved|needs_improvement + the written
 * feedback (bilingual), ONE row PER round (the PK denies a second INSERT — never
 * an overwrite; ADR-0002). One transaction: the review columns ride the definer
 * UPDATE under `ppg_rerun`, the status moves via #13's transition, on the
 * APPROVAL the +150 XP lands idempotently (the ledger PK — the first approval
 * ONCE; a re-approval NEVER conflicts, never a second +150; xp_granted says what
 * landed) + the module badge (the award PK ONCE). A learner/stranger smuggle
 * the call as denied_role; a missing round as submission_missing; a reviewed
 * round as not_pending; the scores NEVER ride the leaderboard (ADR-0001).
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const { moduleKey, submissionSeq, scores, decision, feedbackTh, feedbackEn } =
    await req.json()

  if (
    !moduleKey ||
    submissionSeq === undefined ||
    !scores ||
    !decision ||
    feedbackTh === undefined ||
    feedbackEn === undefined
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
      tool_usage: Number(scores.tool_usage),
      creativity: Number(scores.creativity),
      completeness: Number(scores.completeness),
    },
    decision as 'approved' | 'needs_improvement',
    feedbackTh ?? null,
    feedbackEn ?? null
  )
  return NextResponse.json(result)
}