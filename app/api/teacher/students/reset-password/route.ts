import { NextRequest, NextResponse } from 'next/server'

import { rejectCrossOrigin } from '../../../../../lib/authGuard'
import { targetLearnerSchema } from '../../../../../lib/provision/studentAdmin'
import { resetLearnerPassword, staffGate } from '../../../../../lib/sup/studentAdmin'

/**
 * Teacher/Admin reset: set a fresh one-time temp password + the DB
 * `must_change_password` flag so the learner's next login lands on
 * /change-password. The caller role comes from the session JWT profile; the
 * target must be a `learner`. The temp password rides this response ONLY —
 * never the audit stream — and every success writes one audit row.
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

  const result = await resetLearnerPassword(
    gate.role,
    gate.userId,
    parsed.data.target_id,
  )
  return NextResponse.json(
    {
      ok: result.ok,
      detail: result.detail,
      audit: result.audit,
      // Shown once in the UI; only on a successful reset.
      ...(result.ok && result.temp_password ? { temp_password: result.temp_password } : {}),
    },
    { status: result.status ?? (result.ok ? 200 : 500) },
  )
}
