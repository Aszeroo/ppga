import { NextRequest, NextResponse } from 'next/server'

import { readReviewQueueViaRpc } from '../../../../lib/sup/reviews'

/**
 * Ticket #14 Teacher's review queue: the submissions whose status rides `submitted`
 * (pending review; the learner name + the Mission + the round; the oldest round
 * first). The teacher/admin-only gate (a learner smuggle the call as denied_role;
 * RLS denies a stranger's read); the profile join carries the name (the
 * teacher/admin's own profile policy).
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

  const result = await readReviewQueueViaRpc(String(moduleKey))
  return NextResponse.json(result)
}