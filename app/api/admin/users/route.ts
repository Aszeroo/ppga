import { NextRequest, NextResponse } from 'next/server'

import {
  listUsersViaRpc,
  usersPageSchema,
} from '../../../../lib/sup/admin'

/**
 * Ticket #6 user list: the admin console's roster, paginated (page-20, ordered
 * by student_id). The RPC's own gate reads the request's JWT so a learner/
 * teacher reaches PostgREST as `permission_denied` — the denial is a RLS/Fn
 * outcome, never a UI-only hide. `force-dive` so `next build` never
 * pre-render someone else's roster snapshot.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const parsed = usersPageSchema.safeParse({
    page: Number(new URL(req.url).searchParams.get('page') ?? 0),
  })

  if (!parsed.success) {
    return NextResponse.json({
      status: 'error',
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const state = await listUsersViaRpc(parsed.data.page)
  return NextResponse.json(state)
}
