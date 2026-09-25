import { Suspense } from 'react'

import { checkDatabaseConnectivity } from '../../lib/sup/health'

/**
 * The health page is a live Postgres probe — `force-dynamic` so `next build`
 * never pre-renders a snapshot of the connectivity result.
 */
export const dynamic = 'force-dynamic'

async function HealthContent() {
  const result = await checkDatabaseConnectivity()
  return (
    <section>
      <p>Database connectivity: {result.status}</p>
      {result.detail ? <p>Detail: {result.detail}</p> : null}
    </section>
  )
}

export default function HealthPage() {
  return (
    <Suspense fallback={<div>Checking Supabase Postgres…</div>}>
      <HealthContent />
    </Suspense>
  )
}