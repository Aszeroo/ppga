import { Suspense } from 'react'

import { getTranslations } from 'next-intl/server'
import { Link } from '../../lib/i18n/routing'

import { readGateViaTable } from '../../lib/sup/prettest'
import { readPosttestState } from '../../lib/sup/posttest'
import { readSurveyState } from '../../lib/sup/survey'

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
  const t = await getTranslations('home')
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

/**
 * Ticket #15 research close (the dashboard's next action after the Course):
 * the Post-Test unlocks on the Final Project's ACCEPTANCE, the Survey follows
 * the Post-Test — the unlocks ride the DATABASE's own gate functions (the
 * completion the Teacher's approval writes; the learner's own submitted
 * Post-Test stamp), never a browser-smuggled flag. Nothing here grants a
 * reward: the close instruments are research, not currency (ADR-0001).
 */
async function CloseChain() {
  const t = await getTranslations('home')
  const posttest = await readPosttestState()
  const survey = await readSurveyState()
  const ready = posttest.status === 'ok' && survey.status === 'ok'
  return (
    <section aria-label={t('closeLabel')}>
      {ready && !posttest.unlocked ? <p>{t('states.closeLocked')}</p> : null}
      {ready && posttest.unlocked && !posttest.submitted ? (
        <p>
          <Link href="/post-test">{t('linkPostTest')}</Link>
        </p>
      ) : null}
      {ready && survey.unlocked && !survey.submitted ? (
        <p>
          <Link href="/survey">{t('linkSurvey')}</Link>
        </p>
      ) : null}
      {ready && survey.submitted ? <p>{t('states.closeDone')}</p> : null}
      {posttest.status === 'error' || survey.status === 'error' ? <p>{t('states.error')} {posttest.detail ?? survey.detail}</p> : null}
    </section>
  )
}

export default async function HomePage() {
  const t = await getTranslations('home')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <main>
        <NextAction />
        <CloseChain />
        <section>
          <Link href="/health">{t('healthLink')}</Link>
        </section>
        <section aria-label={t('linkLeaderboard')}>
          <Link href="/leaderboard">{t('linkLeaderboard')}</Link>
        </section>
      </main>
    </Suspense>
  )
}
