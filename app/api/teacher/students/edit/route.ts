import { NextRequest, NextResponse } from 'next/server'

import { rejectCrossOrigin } from '../../../../../lib/authGuard'
import { editLearnerSchema } from '../../../../../lib/provision/studentAdmin'
import { editLearner, staffGate } from '../../../../../lib/sup/studentAdmin'

/**
 * Teacher/Admin edit: change a learner's display name and login handle
 * (student ID). The caller's role comes from their PROFILE through the
 * session JWT (`staffGate`), never the body; the target's role is re-read
 * from the DB before any write, so a non-learner target is refused with
 * `forbidden_target`. The handle change also updates the synthetic auth email
 * (`<handle>@ppga.local`); a conflict changes nothing. Every success writes
 * exactly one `student_edit` audit row. See lib/sup/studentAdmin.ts for the
 * service-role justification (the same legitimate use as provisioning).
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req)
  if (crossOrigin) return crossOrigin

  const body = await req.json().catch(() => ({}) as never)
  const parsed = editLearnerSchema.safeParse(body)
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

  const result = await editLearner(
    gate.role,
    gate.userId,
    parsed.data.target_id,
    parsed.data.student_id,
    parsed.data.full_name,
  )
  return NextResponse.json(
    { ok: result.ok, detail: result.detail, audit: result.audit },
    { status: result.status ?? (result.ok ? 200 : 500) },
  )
}
