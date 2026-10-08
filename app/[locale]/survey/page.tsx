import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import {
  readSurveyState,
  readSurveyItemsViaTable,
} from '../../../lib/sup/survey'
import { Badge } from '../../../components/Badge'
import { StatusPill } from '../../../components/StatusPill'

/**
 * Ticket #15 Satisfaction Survey, #54 V3 dressing (presentation only — the
 * reads, the unlock machine, the SHIPPED form fields/patterns/`data-ppg-*`
 * attrs and the submit route are UNCHANGED): the instrument wearing the
 * gallery's card/tag idiom — the heading block (the 😊 title + the 1–5
 * satisfaction subline), the research/no-XP chips, each item a question card
 * with the real Question {n}/{total} progress chips + the seeded choice tiles
 * (the tiles PRESENT the choices; the answers still ride the shipped text
 * inputs — no new control), and the submitted receipt (the ✓ receipt heading,
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
          {t('instrumentHeading')}
        </h1>
        <p className="ppg-card-text" style={{ color: 'var(--ppg-muted)' }}>
          {t('satisfactionSub')}
        </p>
        <p style={{ display: 'flex', gap: 'var(--ppg-space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Badge text={t('researchTag')} tone="neutral" />
          <Badge text={t('noXpTag')} tone="warning" />
        </p>
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

async function Items({ locale }: { locale: string }) {
  const t = await getTranslations('survey')
  const state = await readSurveyItemsViaTable()
  const items = state.status === 'ok' ? state.items ?? [] : []
  const total = items.length
  return (
    <section aria-label={t('itemsLabel')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ppg-space-3)' }}>
      {state.status === 'ok'
        ? items.map((item: { id: string; th: { prompt: string; choices: Record<string, string> }; en: { prompt: string; choices: Record<string, string> } }, i: number) => {
          const pick = locale === 'th' ? item.th : item.en
          return (
            <div key={item.id} className="ppg-instr-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--ppg-space-2)', flexWrap: 'wrap' }}>
                <Badge text={`${t('questionTag')} ${i + 1}`} tone="neutral" />
                <Badge text={t('itemProgress', { n: String(i + 1), total: String(total) })} tone="neutral" />
              </div>
              <p className="ppg-sc-question">{pick.prompt}</p>
              <div className="ppg-sc-options">
                {Object.entries(pick.choices ?? {}).map(([letter, text]) => (
                  <div key={letter} className="ppg-instr-opt">
                    <span className="ppg-sc-opt-letter" aria-hidden="true">{letter}</span>
                    <span className="ppg-sc-opt-text">{text}</span>
                  </div>
                ))}
              </div>
            </div>
          )
        })
        : null}
      {state.status === 'empty' ? <p className="ppg-state-line">{t('states.itemsEmpty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p className="ppg-state-line">{t('states.itemsError')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p className="ppg-state-line">{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p className="ppg-state-line">{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p className="ppg-state-line">{t('states.notConfigured')} {state.detail}</p> : null}
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
        submit route's gated, idempotent `ppg_survey_start` call. #54: ONLY
        classes were added — fields, names, patterns and the `data-ppg-*`
        attrs are byte-identical to the shipped form. */}
      <div className="ppg-sc-panel">
        <form
          data-ppg-survey-form="survey"
          data-ppg-survey-submit="true"
          aria-label={t('submitLabel')}
          method="POST"
          action="/api/survey/submit"
        >
          <input name="language" defaultValue={locale === 'th' ? 'th' : 'en'} hidden={true} />
          <label className="ppg-field-label" htmlFor="survey_answer_item_1">{t('answerLabel')}</label>
          <input className="ppg-input" id="survey_answer_item_1" name="item_1" required pattern="^[A-C]$" />
          <label className="ppg-field-label" htmlFor="survey_answer_item_2">{t('answerLabel')}</label>
          <input className="ppg-input" id="survey_answer_item_2" name="item_2" required pattern="^[A-C]$" />
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
        <Items locale={locale} />
        <SurveyForm locale={locale} />
      </div>
    </Suspense>
  )
}
