import { Suspense } from 'react'

import { getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import { readGateViaTable } from '../../../lib/sup/prettest'
import { StatusPill } from '../../../components/StatusPill'

/**
 * Ticket #8 content placeholder, #54 V3 dressing (presentation only — the
 * reads and the gate machine are UNCHANGED): the gate page wearing the
 * established V3 idiom (the gallery carries no dedicated content-gate
 * screen, so the heading block + the framed status card + the primary CTA row
 * are the same `#s-dash`/`#s-board` card language the learner core rides).
 * The locked-content state a submitted (or audited-override) Learner sees
 * until the real curriculum ships. The placeholder's own read rides the
 * DATABASE's `ppg_course_content` (the gate-proof table the `ppg_learner_gated`
 * policy denies an ungated learner at the row level — content is
 * INACCESSIBLE server-side before the gate opens, never just hidden); the
 * gate status rides the same authority the dashboard's state machine speaks.
 * The gate's state rides pill COPY + icon beside the tone (never colour
 * alone). `force-dynamic` because the page reads the gate through the
 * session JWT — `next build` must never pre-render someone else's gate
 * state. Every state (`content.states.*`, `content.locked`,
 * `content.linkPreTest`, `content.fallbackSuspense`) has its own copy in
 * `messages`.
 */
export const dynamic = 'force-dynamic'

async function GateStatus() {
  const t = await getTranslations('content')
  const state = await readGateViaTable()
  return (
    <section aria-label={t('gateLabel')} className="ppg-page-wrap">
      <div
        style={{
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: 'var(--ppg-space-2)',
          textAlign: 'center',
        }}
      >
        <h1
          className="ppg-heading ppg-heading-text"
          style={{
            fontFamily: 'var(--font-ppg-display), var(--font-ppg-body)',
            color: 'var(--ppg-pink-300)',
            fontSize: '28px',
            fontWeight: 800,
          }}
        >
          {t('gateLabel')}
        </h1>
        <p className="ppg-card-text" style={{ color: 'var(--ppg-muted)' }}>
          {t('locked')}
        </p>
      </div>

      <div className="ppg-status-card ppg-strip-top">
        {state.status === 'ok' && !state.consent ? (
          <p>
            <StatusPill tone="warning" label={t('states.noConsent')} /> {state.detail}
          </p>
        ) : null}
        {state.status === 'ok' && state.consent && !state.submitted && !state.override ? (
          <p>
            <StatusPill tone="locked" label={t('states.locked')} /> {state.detail}
          </p>
        ) : null}
        {state.status === 'ok' && (state.submitted || state.override) ? (
          <p>
            <StatusPill tone="success" label={t('states.unlocked')} /> {state.detail}
          </p>
        ) : null}
        {state.status === 'error' ? <p className="ppg-state-line">{t('states.error')} {state.detail}</p> : null}
        {state.status === 'denied' ? <p className="ppg-state-line">{t('states.denied')} {state.detail}</p> : null}
        {state.status === 'unauthorized' ? <p className="ppg-state-line">{t('states.unauthorized')} {state.detail}</p> : null}
        {state.status === 'not-configured' ? <p className="ppg-state-line">{t('states.notConfigured')} {state.detail}</p> : null}

        <p className="ppg-hero-cta-row">
          <Link className="ppg-cta" href="/pre-test">{t('linkPreTest')}</Link>
        </p>
        <p className="ppg-hero-cta-row">
          <Link className="ppg-link" href="/">{t('linkDashboard')}</Link>
        </p>
      </div>
    </section>
  )
}

export default async function ContentPage() {
  const t = await getTranslations('content')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <GateStatus />
    </Suspense>
  )
}
