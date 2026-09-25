import { NextResponse } from 'next/server'

import { checkDatabaseConnectivity } from '../../../lib/sup/health'

/**
 * The result is a live Postgres probe, never a build-time snapshot —
 * `force-dynamic` so `next build` does not pre-render this GET and the
 * deployment then serves the frozen status for every request.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const result = await checkDatabaseConnectivity()
  return NextResponse.json({ status: result.status, detail: result.detail })
}