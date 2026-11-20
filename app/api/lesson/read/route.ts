import { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

import { rejectCrossOrigin } from '../../../../lib/authGuard'
import { claimLessonReadViaRpc } from '../../../../lib/sup/lessonRead'

/**
 * PPGA #141: claim the one-time +20 XP for finishing a lesson.
 *
 * The RPC re-checks the learner session, the #8 gate and the lesson's own
 * visibility; this route only rejects a foreign Origin and a malformed body.
 * A learner who cannot see the lesson is denied (403), never awarded.
 */
export const dynamic = 'force-dynamic'

const bodySchema = z
  .object({
    lesson_key: z.string().regex(/^(module|chapter)-\d{2}-lesson-\d{2}$/),
  })
  .strict()

export async function POST(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req)
  if (crossOrigin) return crossOrigin

  const body = await req.json().catch(() => ({}) as never)
  const parsed = bodySchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      { ok: false, detail: 'invalid_lesson_key', awarded: false, already: false },
      { status: 400 },
    )
  }

  const result = await claimLessonReadViaRpc(parsed.data.lesson_key)

  if (result.status === 'not-configured') {
    return NextResponse.json({ ok: false, detail: result.detail, awarded: false, already: false }, { status: 500 })
  }
  if (result.status === 'unauthorized') {
    return NextResponse.json({ ok: false, detail: 'unauthorized', awarded: false, already: false }, { status: 401 })
  }
  if (result.status === 'denied') {
    return NextResponse.json({ ok: false, detail: result.detail, awarded: false, already: false }, { status: 403 })
  }
  if (result.status === 'error') {
    return NextResponse.json({ ok: false, detail: result.detail, awarded: false, already: false }, { status: 500 })
  }

  return NextResponse.json({
    ok: true,
    awarded: result.status === 'ok' && result.awarded === true,
    already: result.status === 'already',
    amount: result.amount ?? 0,
    total: result.total,
  })
}
