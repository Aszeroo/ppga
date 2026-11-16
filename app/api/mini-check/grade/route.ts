import { NextRequest, NextResponse } from 'next/server'

import { rejectCrossOrigin } from '../../../../lib/authGuard'
import { gradeMiniCheckViaRpc } from '../../../../lib/sup/lessonSteps'

/**
 * PPGA #75 mini-check grade: the player posts one chosen option and receives
 * `{ ok, correct, explanation }`. The RPC compares the answer key
 * server-side, writes NOTHING, and the response never carries the key — so
 * the browser cannot read `is_correct` before or after answering. This route
 * is separate from the Self-Check submit path on purpose: mini-checks never
 * gate progression and never award XP.
 */
export const dynamic = 'force-dynamic'

interface GradeBody {
  lesson_key?: unknown
  order_index?: unknown
  option_key?: unknown
  locale?: unknown
}

export async function POST(req: NextRequest) {
  // Ticket #63: reject a foreign Origin on every mutating handler.
  const crossOrigin = rejectCrossOrigin(req)
  if (crossOrigin) return crossOrigin

  const body = (await req.json().catch(() => ({}))) as GradeBody
  const lessonKey = typeof body.lesson_key === 'string' ? body.lesson_key : ''
  const orderIndex = typeof body.order_index === 'number' ? body.order_index : Number.NaN
  const optionKey = typeof body.option_key === 'string' ? body.option_key : ''
  const locale = body.locale === 'th' ? 'th' : 'en'

  if (!lessonKey || !Number.isInteger(orderIndex) || !optionKey) {
    return NextResponse.json({
      ok: false,
      detail: 'lesson_key, order_index and option_key are required',
    })
  }

  const result = await gradeMiniCheckViaRpc(lessonKey, orderIndex, optionKey)
  if (!result.ok) return NextResponse.json({ ok: false, detail: result.detail })

  return NextResponse.json({
    ok: true,
    correct: result.correct === true,
    explanation: locale === 'th' ? result.explanation_th : result.explanation_en,
  })
}
