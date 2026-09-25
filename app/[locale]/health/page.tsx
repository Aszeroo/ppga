import { Suspense } from 'react'

import { useTranslations } from 'next-intl'

import { checkDatabaseConnectivity } from '../../../lib/sup/health'

/**
 * The health page is a live Postgres probe — `force-dynamic` so `next build`
 * never pre-renders a snapshot of the connectivity result.
 *
 * Ticket #4: the copy moves into messages (`health.connectivity`,
 * `health.detail`, `health.fallbackSuspense`) — so the probe reads in the
 * selected language, and the fallback chain speaks when a copy is missing.
 */
export const dynamic = 'force-dynamic'

async function HealthContent() {
  const t = useTranslations('health')
  const result = await checkDatabaseConnectivity()
  return (
    <section>
      <p>{t('connectivity')} {result.status}</p>
      {result.detail ? <p>{t('detail')} {result.detail}</p> : null}
    </section>
  )
}

export default function HealthPage() {
  const t = useTranslations('health')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <HealthContent />
    </Suspense>
  )
}
