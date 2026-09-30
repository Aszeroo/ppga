import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import {
  readSurveyState,
  readSurveyItemsViaTable,
} from '../../../lib/sup/survey'

/**
 * Ticket #15 Satisfaction Survey: the research close's last screen —
 * reachable as a screen ONLY after the learner's OWN Post-Test is submitted
 * (the DATABASE's `ppg_survey_unlocked` is the authority; the items read
 * rides the instrument's policy and an early learner reaches `denied`, never
 * a hidden UI; the submit function re-gates as `posttest_not_submitted`,
 * never a silently-early Survey; ADR-0002). The survey carries NO answer key
 * and NO score — satisfaction is not an assessment — and grants NO XP, NO
 * badge: a research instrument never rewards (ADR-0001). `force-dynamic`
 * because the page reads the unlock + the items through the session JWT.
 * Every state (`survey.states.*`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function UnlockStatus() {
  const t = await getTranslations('survey')
  const state = await readSurveyState()
  return (
    <section aria-label={t('gateLabel')}>
      {state.status === 'ok' && !state.unlocked ? <p>{t('states.locked')} {state.detail}</p> : null}
      {state.status === 'ok' && state.unlocked && !state.submitted ? <p>{t('states.unlocked')} {state.detail}</p> : null}
      {state.status === 'ok' && state.submitted ? <p>{t('states.submittedOnce')} {state.detail} ({state.instrumentVersion} / {state.language})</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

async function Items({ locale }: { locale: string }) {
  const t = await getTranslations('survey')
  const state = await readSurveyItemsViaTable()
  return (
    <section aria-label={t('itemsLabel')}>
      {state.status === 'ok' ? (
        state.items?.map((item: { id: string; th: { prompt: string }; en: { prompt: string } }) => (
          <p key={item.id}>
            {locale === 'th' ? item.th.prompt : item.en.prompt}
          </p>
        ))
      ) : null}
      {state.status === 'empty' ? <p>{t('states.itemsEmpty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.itemsError')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

async function SurveyForm({ locale }: { locale: string }) {
  const t = await getTranslations('survey')
  return (
    <section>
      {/* The single submit posts the `ppg_survey_submit` RPC once (the submit
        function re-gates the unlock + stamps `submitted_at`; a second submit
        reaches `already_submitted_or_missing`, never a silent overwrite). The
        hidden language field records the taken language with the row
        (ADR-0002) — the DATABASE re-validates th|en. The row start rides the
        submit route's gated, idempotent `ppg_survey_start` call. */}
      <form
        data-ppg-survey-form="survey"
        data-ppg-survey-submit="true"
        aria-label={t('submitLabel')}
        method="POST"
        action="/api/survey/submit"
      >
        <input name="language" defaultValue={locale === 'th' ? 'th' : 'en'} hidden={true} />
        <label htmlFor="survey_answer_item_1">{t('answerLabel')}</label>
        <input id="survey_answer_item_1" name="item_1" required pattern="^[A-C]$" />
        <label htmlFor="survey_answer_item_2">{t('answerLabel')}</label>
        <input id="survey_answer_item_2" name="item_2" required pattern="^[A-C]$" />
        <button type="submit">{t('submitLabel')}</button>
      </form>
      <p>
        <Link href="/post-test">{t('linkPostTest')}</Link>
      </p>
      <p>
        <Link href="/course">{t('linkCourse')}</Link>
      </p>
      <p>
        <Link href="/">{t('linkDashboard')}</Link>
      </p>
    </section>
  )
}

export default async function SurveyPage() {
  const t = await getTranslations('survey')
  const locale = await getLocale()
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <UnlockStatus />
      <Items locale={locale} />
      <SurveyForm locale={locale} />
    </Suspense>
  )
}
