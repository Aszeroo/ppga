import { NextRequest, NextResponse } from 'next/server'

import { readLatestReviewViaRpc } from '../../../../lib/sup/reviews'

/**
 * Ticket #14 The LEARNER's latest result read: the latest decision on the
 * Mission + the rubric breakdown (7 scores 1–5, the server-computed total
 * 7–35) + the bilingual written feedback + the full review history array (the
 * append-only per-round rows; the learner sees their own rows ONLY — an other
 * learner's reviews NEVER ride out; a teacher/admin sees every row). The scores
 * NEVER ride the leaderboard (ADR-0001: the leaderboard's read is XP; the
 * rubric stays PER REVIEW).
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url)
  const moduleKey = searchParams.get('moduleKey')

  if (!moduleKey) {
    return NextResponse.json({
      status: 'error',
      detail: 'moduleKey missing',
    })
  }

  const result = await readLatestReviewViaRpc(String(moduleKey))
  return NextResponse.json(result)
}