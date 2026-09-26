import { Suspense } from 'react'

import { useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

import { readGateViaTable } from '../../../lib/sup/prettest'

/**
 * Ticket #8 content placeholder: the locked-content state a submitted (or
 * audited-override) Learner sees until #9 ships the real curriculum (the
 * milestone plan's M2-before-M3 ordering: the Pre-Test flow must be live
 * before content ships). The placeholder's own read rides the DATABASE's
 * `ppg_course_content` (the gate-proof table the `ppg_learner_gated`
 * policy denies an ungated learner at the row level — content is
 * INACCESSIBLE server-side before the gate opens, never just hidden); the
 * gate status rides the same authority the dashboard's state machine
 * speaks. `force-dynamic` because the page reads the gate through the
 * session JWT — `next build` must never pre-render someone else's gate
 * state. Every state (`content.states.*`, `content.locked`,
 * `content.linkPreTest`, `content.fallbackSuspense`) has its own copy in
 * `messages`.
 */
export const dynamic = 'force-dynamic'

async function GateStatus() {
  const t = useTranslations('content')
  const state = await readGateViaTable()
  return (
    <section aria-label={t('gateLabel')}>
      {state.status === 'ok' && !state.consent ? <p>{t('states.noConsent')} {state.detail}</p> : null}
      {state.status === 'ok' && state.consent && !state.submitted && !state.override ? <p>{t('states.locked')} {state.detail}</p> : null}
      {state.status === 'ok' && (state.submitted || state.override) ? <p>{t('states.unlocked')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

export default function ContentPage() {
  const t = useTranslations('content')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <GateStatus />
      <p>
        <Link href="/pre-test">{t('linkPreTest')}</Link>
      </p>
      <p>
        <Link href="/">{t('linkDashboard')}</Link>
      </p>
    </Suspense>
  )
}
