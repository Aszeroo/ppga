import { NextRequest, NextResponse } from 'next/server'

import { readRubricCriteriaViaRpc } from '../../../../lib/sup/reviews'

/**
 * Ticket #14 The rub criteria read: the criteria (the 7 names) + the descriptors
 * (the 35 bilingual band texts) for the review form + the learner's result to
 * show the descriptor for the score earned. The taxonomy is shared (read-only;
 * ADR-0003); a learner/teacher/admin sees every row.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await readRubricCriteriaViaRpc()
  return NextResponse.json(result)
}