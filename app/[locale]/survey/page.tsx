import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import {
  readSurveyState,
  readSurveyItemsViaTable,
} from '../../../lib/sup/survey'
import { Badge } from '../../../components/Badge'
import { InstrumentItems } from '../../../components/PreTestItems'
import { InstrumentProgress } from '../../../components/InstrumentProgress'
import { StatusPill } from '../../../components/StatusPill'

/**
 * Ticket #15 Satisfaction Survey, #54 V3 dressing, per-item radio controls
 * (the reads, the unlock machine, the `item_<n>` field names, the shipped
 * `data-ppg-*` attrs and the submit route are UNCHANGED): the instrument wearing the
 * gallery's card/tag idiom — the heading block (the 😊 title + the 1–5
 * satisfaction subline), the research/no-XP chips, each item a question card
 * with the real Question {n}/{total} progress chips + the seeded choice rows
 * as required per-item radio controls (`item_<n>`, the Pre-Test/Final-Test
 * control system generalised in #83/#84), and the submitted receipt (the ✓ receipt heading,
 * the immutable-once-submitted note + the success pill; a second submit still
 * reaches `already_submitted_or_missing`, never a silent overwrite). The
 * survey carries NO answer key and NO score — satisfaction is not an
 * assessment — and grants NO XP, NO badge: a research instrument never
 * rewards (ADR-0001). Reachable ONLY after the learner's OWN Post-Test is
 * submitted (the DATABASE's `ppg_survey_unlocked` is the authority).
 * `force-dynamic` because the page reads the unlock + the items through the
 * session JWT. Every state (`survey.states.*`) has its own copy in
 * `messages`; the V3 dressing's NEW copy (`survey.researchTag/noXpTag/
 * instrumentHeading/satisfactionSub/questionTag/itemProgress/receiptHeading/
 * immutableNote/immutableTag`) rides the same file in BOTH locales.
 */
export const dynamic = 'force-dynamic'

async function UnlockStatus() {
  const t = await getTranslations('survey')
  const state = await readSurveyState()
  return (
    <section aria-label={t('gateLabel')}>
      {/** The course/badges header pattern: left-aligned ink title, the
       * secondary line under it, the research/no-XP tags aligned beside. */}
      <div className="ppg-gallery-head">
        <div>
          <h1 className="ppg-heading ppg-heading-text ppg-gallery-title">
            {t('instrumentHeading')}
          </h1>
          <p className="ppg-card-text">{t('satisfactionSub')}</p>
        </div>
        <div className="ppg-gallery-counts">
          <Badge text={t('researchTag')} tone="neutral" />
          <Badge text={t('noXpTag')} tone="warning" />
        </div>
      </div>

      {state.status === 'ok' && !state.unlocked ? <p className="ppg-state-line">{t('states.locked')} {state.detail}</p> : null}
      {state.status === 'ok' && state.unlocked && !state.submitted ? <p className="ppg-state-line">{t('states.unlocked')} {state.detail}</p> : null}

      {state.status === 'ok' && state.submitted ? (
        <div className="ppg-instr-receipt">
          <h2 className="ppg-sc-result-title">{'✓ '}<span>{t('receiptHeading')}</span></h2>
          <p>{t('states.submittedOnce')} {state.detail} ({state.instrumentVersion} / {state.language})</p>
          <p>{t('immutableNote')}</p>
          <StatusPill tone="success" label={t('immutableTag')} />
        </div>
      ) : null}

      {state.status === 'error' ? <p className="ppg-state-line">{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p className="ppg-state-line">{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p className="ppg-state-line">{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p className="ppg-state-line">{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

// fallow-ignore-next-line complexity
async function SurveyForm({ locale }: { locale: string }) {
  const t = await getTranslations('survey')
  const state = await readSurveyItemsViaTable()
  const items = state.status === 'ok' ? state.items ?? [] : []
  return (
    <section aria-label={t('itemsLabel')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ppg-space-3)' }}>
      {/* The single submit posts the `ppg_survey_submit` RPC once (the submit
        function re-gates the unlock + stamps `submitted_at`; a second submit
        reaches `already_submitted_or_missing`, never a silent overwrite). The
        hidden language field records the taken language with the row
        (ADR-0002) — the DATABASE re-validates th|en. The row start rides the
        submit route's gated, idempotent `ppg_survey_start` call. The form
        WRAPS the item list (the Pre-Test/Final-Test control system), so every
        required `item_<n>` radio group is submitted; the route's `item_`
        filter forwards them to the RPC. The shipped `data-ppg-*` attrs,
        method, action and the single submit button are unchanged. */}
      <div className="ppg-sc-panel">
        <form
          data-ppg-survey-form="survey"
          data-ppg-survey-submit="true"
          aria-label={t('submitLabel')}
          method="POST"
          action="/api/survey/submit"
        >
          <InstrumentProgress total={items.length} template={t('answeredCount')} />
          <InstrumentItems
            items={items}
            locale={locale}
            answerIdPrefix="survey"
            questionTag={(n) => t('questionTag', { n: String(n) })}
            itemProgress={(n, total) => t('itemProgress', { n: String(n), total: String(total) })}
            answerForQuestion={(n) => t('answerForQuestion', { n: String(n) })}
          />
          {state.status === 'empty' ? <p className="ppg-state-line">{t('states.itemsEmpty')} {state.detail}</p> : null}
          {state.status === 'error' ? <p className="ppg-state-line">{t('states.itemsError')} {state.detail}</p> : null}
          {state.status === 'denied' ? <p className="ppg-state-line">{t('states.denied')} {state.detail}</p> : null}
          {state.status === 'unauthorized' ? <p className="ppg-state-line">{t('states.unauthorized')} {state.detail}</p> : null}
          {state.status === 'not-configured' ? <p className="ppg-state-line">{t('states.notConfigured')} {state.detail}</p> : null}
          <input name="language" defaultValue={locale === 'th' ? 'th' : 'en'} hidden={true} />
          <div className="ppg-sc-cta-row">
            <button className="ppg-button" type="submit">{t('submitLabel')}</button>
          </div>
        </form>
      </div>
      <p>
        <Link className="ppg-link" href="/post-test">{t('linkPostTest')}</Link>
      </p>
      <p>
        <Link className="ppg-link" href="/course">{t('linkCourse')}</Link>
      </p>
      <p>
        <Link className="ppg-link" href="/">{t('linkDashboard')}</Link>
      </p>
    </section>
  )
}

export default async function SurveyPage() {
  const t = await getTranslations('survey')
  const locale = await getLocale()
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <div className="ppg-page-wrap">
        <UnlockStatus />
        <SurveyForm locale={locale} />
      </div>
    </Suspense>
  )
}
