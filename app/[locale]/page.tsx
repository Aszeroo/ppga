import { Suspense } from 'react'

import { useTranslations } from 'next-intl'
import { Link } from '../../lib/i18n/routing'

import { readGateViaTable } from '../../lib/sup/prettest'

/**
 * Ticket #8 dashboard (the home): the next action per state, always shown
 * (#13 story) — a Learner without consent sees the respectful explanation
 * and no access to the Pre-Test; a consenting un-submitted Learner sees
 * the Pre-Test screen only; a submitted (or audited-override) Learner sees
 * the locked-content placeholder until #9 ships the real curriculum. The
 * gate status rides the DATABASE's own flags + the response's own
 * `submitted_at` under the CALLER's JWT + RLS — the UI's state machine
 * speaks the same authority the content gate (#9's future tables) will
 * read at the row level, never a hidden UI. `force-dynamic` because the
 * page reads the gate through the session JWT — `next build` must never
 * pre-render someone else's gate state. Every state (`home.states.*`,
 * `home.nextAction`, `home.linkPreTest`, `home.linkContent`,
 * `home.fallbackSuspense`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function NextAction() {
  const t = useTranslations('home')
  const state = await readGateViaTable()
  return (
    <section aria-label={t('nextAction')}>
      {state.status === 'ok' && !state.consent && !state.override ? <p>{t('states.noConsent')} {state.detail}</p> : null}
      {state.status === 'ok' && !state.consent && !state.override ? <p><Link href="/">{t('nextActionExplanation')}</Link></p> : null}
      {state.status === 'ok' && state.consent && !state.submitted && !state.override ? <p>{t('states.consentNoSubmit')} {state.detail}</p> : null}
      {state.status === 'ok' && state.consent && !state.submitted && !state.override ? <p><Link href="/pre-test">{t('linkPreTest')}</Link></p> : null}
      {state.status === 'ok' && (state.submitted || state.override) ? <p>{t('states.gateOpen')} {state.detail}</p> : null}
      {state.status === 'ok' && (state.submitted || state.override) ? <p><Link href="/course">{t('linkCourse')}</Link></p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

export default function HomePage() {
  const t = useTranslations('home')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <main>
        <NextAction />
        <section>
          <Link href="/health">{t('healthLink')}</Link>
        </section>
      </main>
    </Suspense>
  )
}
