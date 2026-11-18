import { NextRequest, NextResponse } from 'next/server'

import { rejectCrossOrigin } from '../../../../../lib/authGuard'
import { targetLearnerSchema } from '../../../../../lib/provision/studentAdmin'
import { deleteLearner, staffGate } from '../../../../../lib/sup/studentAdmin'

/**
 * Teacher/Admin delete: permanently remove a learner's auth user. The
 * profile and every answer/XP/award row cascade from `auth.users` (the
 * dialog states this plainly). The caller must be staff by their session JWT
 * profile, and the target must be a `learner` — a staff account is never
 * deletable here. Every success writes one `student_delete` audit row.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req)
  if (crossOrigin) return crossOrigin

  const body = await req.json().catch(() => ({}) as never)
  const parsed = targetLearnerSchema.safeParse(body)
  if (!parsed.success) {
    return NextResponse.json(
      {
        ok: false,
        detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
      },
      { status: 400 },
    )
  }

  const gate = await staffGate()
  if (gate.kind !== 'ok') {
    return NextResponse.json(
      { ok: false, detail: gate.kind },
      { status: gate.kind === 'unauthorized' ? 401 : 403 },
    )
  }

  const result = await deleteLearner(
    gate.role,
    gate.userId,
    parsed.data.target_id,
  )
  return NextResponse.json(
    { ok: result.ok, detail: result.detail, audit: result.audit },
    { status: result.status ?? (result.ok ? 200 : 500) },
  )
}
