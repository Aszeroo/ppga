import { NextRequest, NextResponse } from 'next/server'

import { rejectCrossOrigin } from '../../../../lib/authGuard'
import { attendanceRequestSchema, toAttendancePayload } from '../../../../lib/attendance'
import { staffGate } from '../../../../lib/sup/studentAdmin'
import { createAttendanceSession, saveAttendance } from '../../../../lib/sup/attendance'

/**
 * PPGA #141 teacher attendance route: create a session or save one roster.
 *
 * The caller's role comes from their own PROFILE through the session JWT
 * (`staffGate`), never the body. The database RPCs check the same thing
 * again (JWT role + profile row) and refuse any target that is not a
 * `learner`. A foreign Origin is rejected before anything else.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const crossOrigin = rejectCrossOrigin(req)
  if (crossOrigin) return crossOrigin

  const body = await req.json().catch(() => ({}) as never)
  const parsed = attendanceRequestSchema.safeParse(body)
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

  if (parsed.data.action === 'create') {
    const result = await createAttendanceSession({
      session_date: parsed.data.session_date,
      module_key: parsed.data.module_key,
      label_th: parsed.data.label_th,
      label_en: parsed.data.label_en,
    })
    return NextResponse.json(result, { status: result.status ?? (result.ok ? 200 : 500) })
  }

  const result = await saveAttendance({
    session_id: parsed.data.session_id,
    rows: toAttendancePayload(
      parsed.data.rows.map((row) => ({
        learnerId: row.learner_id,
        present: row.present,
        earlyBird: row.early_bird,
        behaviorPoints: row.behavior_points,
      })),
    ),
  })
  return NextResponse.json(result, { status: result.status ?? (result.ok ? 200 : 500) })
}
