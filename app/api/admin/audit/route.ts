import { NextRequest, NextResponse } from 'next/server'

import {
  readAuditViaTable,
} from '../../../../lib/sup/admin'

/**
 * Ticket #6 audit read: the console's audit stream, latest first, admin-only
 * at the DATABASE's level — the `ppg_audit_events_select` policy grants SELECT
 * to an admin alone; a teacher/learner reaches `permission denied for table`
 * at RLS, never a UI-only hide. The stream is append-only: the table grants
 * no UPDATE/DELETE policy, so every later operation (this ticket's role
 * changes; later provisioning/overrides/exports) rides the INSERT path.
 * `force-dynamic` so `next build` never pre-render someone else's audit log.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const limit = Number(new URL(req.url).searchParams.get('limit') ?? 50)

  const state = await readAuditViaTable(
    limit,
  )
  return NextResponse.json(state)
}
