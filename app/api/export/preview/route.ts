import { NextResponse } from 'next/server'

import { previewExportViaRpc } from '../../../../lib/sup/export'

/**
 * Ticket #16 export preview: the Export page's state read (participants +
 * per-instrument counts) through the teacher/admin-gated RPC — a learner/
 * stranger reaches PostgREST as `permission_denied` (the denial is an RLS/Fn
 * outcome, never a UI-only hide). A page view is NOT an export run: this
 * route never writes an audit event (`ppg_research_export` — the download —
 * is the audited call). `force-dynamic` so `next build` never pre-render
 * someone else's counts snapshot.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const state = await previewExportViaRpc()
  const status =
    state.status === 'denied'
      ? 403
      : state.status === 'unauthorized'
        ? 401
        : state.status === 'not-configured'
          ? 503
          : state.status === 'error'
            ? 500
            : 200
  return NextResponse.json(state, { status })
}
