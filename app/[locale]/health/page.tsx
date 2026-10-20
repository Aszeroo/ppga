import { Suspense } from 'react'

import { getTranslations } from 'next-intl/server'

import { checkDatabaseConnectivity } from '../../../lib/sup/health'
import { StatusPill } from '../../../components/StatusPill'

/**
 * The health page is a live Postgres probe — `force-dynamic` so `next build`
 * never pre-renders a snapshot of the connectivity result.
 *
 * Ticket #4: the copy moves into messages (`health.connectivity`,
 * `health.detail`, `health.fallbackSuspense`) — so the probe reads in the
 * selected language, and the fallback chain speaks when a copy is missing.
 *
 * #55 V3 utilitarian dressing (presentation only — the probe, its result
 * shape and every rendered value are UNCHANGED): the page wears the
 * gallery's `#a-health` frame — the heading block (สถานะระบบ + the honest
 * subline) with the probe's OWN status as a COPY+tone StatusPill beside it
 * (the design's `ระบบทำงานปกติ ✓` tag, mirrored on the failure/
 * not-configured outcomes — state as copy + tone, never colour alone) and
 * the real connectivity read as the console's state lines. The design's
 * uptime/response/storage stat tiles and job timeline INVENT numbers no read
 * produces — they stay unbuilt (rule 7).
 */
export const dynamic = 'force-dynamic'

async function HealthContent() {
  const t = await getTranslations('health')
  const result = await checkDatabaseConnectivity()
  const pill: { tone: 'success' | 'warning' | 'error' | 'locked'; label: string } =
    result.status === 'ok'
      ? { tone: 'success', label: t('statusOk') }
      : result.status === 'error'
        ? { tone: 'error', label: t('statusDown') }
        : { tone: 'warning', label: t('statusNotConfigured') }
  return (
    <div className="ppg-page-wrap">
      <div className="ppg-work-head">
        <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">{t('systemTitle')}</h1>
        <p className="ppg-work-head-sub">{t('systemSub')}</p>
        <StatusPill tone={pill.tone} label={pill.label} />
      </div>
      <section aria-label={t('systemTitle')} className="ppg-work-card">
        <p className="ppg-state-line">{t('connectivity')} {result.status}</p>
        {result.detail ? <p className="ppg-state-line">{t('detail')} {result.detail}</p> : null}
      </section>
    </div>
  )
}

export default async function HealthPage() {
  const t = await getTranslations('health')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <HealthContent />
    </Suspense>
  )
}
