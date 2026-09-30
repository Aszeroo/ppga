import { NextRequest, NextResponse } from 'next/server'

import { readReviewHistoryViaRpc } from '../../../../lib/sup/reviews'

/**
 * Ticket #14 The review history read: the rubric reviews per round (the full
 * append-only history; the Learner sees their own rows ONLY (a definer rights
 * filtered to the CALLER's own uid; an other learner's reviews NEVER ride out);
 * a Teacher/Admin sees every row (the review queue's full history). The
 * total_score the SERVER-computed sum (never a client count); the scores
 * NEVER ride the leaderboard (ADR-0001 separation — the leaderboard's read is
 * XP).
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

  const result = await readReviewHistoryViaRpc(String(moduleKey))
  return NextResponse.json(result)
}