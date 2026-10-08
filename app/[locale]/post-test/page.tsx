import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import {
  readPosttestState,
  readPosttestItemsViaTable,
} from '../../../lib/sup/posttest'
import { Badge } from '../../../components/Badge'
import { StatusPill } from '../../../components/StatusPill'

/**
 * Ticket #15 Post-Test, #54 V3 dressing (presentation only — the reads, the
 * unlock machine, the SHIPPED form fields/patterns/`data-ppg-*` attrs and the
 * submit route are UNCHANGED): the instrument wearing the gallery's card/tag
 * idiom — the heading block (the ✅ title + the unlocked subline once the
 * Final Project is accepted), the research/no-XP chips, each item a question
 * card with the real Question {n}/{total} progress chips + the seeded choice
 * tiles (the tiles PRESENT the choices; the answer still rides the shipped
 * text input — no new control), and the submitted receipt (the ✓ receipt
 * heading, the immutable-once-submitted note + the success pill; a second
 * submit still reaches `already_submitted_or_missing`, never a silent
 * overwrite). Reachable as a screen ONLY after the Final Project's ACCEPTANCE
 * (the DATABASE's `ppg_posttest_unlocked` — module-11 `complete`, written by
 * the Teacher's approval alone — is the authority; the items read rides the
 * instrument's policy and an early learner reaches `denied`, never a hidden
 * UI; the submit function re-gates as `final_project_not_accepted`, never a
 * silently-early instrument; ADR-0002). The instrument's items are the
 * bilingual seeded material the Learner sees; the answer key never reaches
 * the browser (the score is the submit function's server-side sum — never
 * client-decided); the instrument grants NO XP, NO badge — a research
 * instrument never rewards (ADR-0001). `force-dynamic` because the page
 * reads the unlock + the items through the session JWT — `next build` must
 * never pre-render someone else's state. Every state (`posttest.states.*`)
 * has its own copy in `messages`; the V3 dressing's NEW copy
 * (`posttest.researchTag/noXpTag/instrumentHeading/unlockedSub/questionTag/
 * itemProgress/receiptHeading/immutableNote/immutableTag`) rides the same
 * file in BOTH locales.
 */
export const dynamic = 'force-dynamic'

async function UnlockStatus() {
  const t = await getTranslations('posttest')
  const state = await readPosttestState()
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
        {state.status === 'ok' && state.unlocked ? (
          <p className="ppg-card-text" style={{ color: 'var(--ppg-muted)' }}>
            {t('unlockedSub')}
          </p>
        ) : null}
        <p style={{ display: 'flex', gap: 'var(--ppg-space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Badge text={t('researchTag')} tone="neutral" />
          <Badge text={t('noXpTag')} tone="warning" />
        </p>
      </div>

      {state.status === 'ok' && !state.unlocked ? <p className="ppg-state-line">{t('states.locked')} {state.detail}</p> : null}
      {state.status === 'ok' && state.unlocked && !state.submitted ? <p className="ppg-state-line">{t('states.unlocked')} {state.detail}</p> : null}

      {state.status === 'ok' && state.unlocked && state.submitted ? (
        <div className="ppg-instr-receipt">
          <h2 className="ppg-sc-result-title">{'✓ '}<span>{t('receiptHeading')}</span></h2>
          <p>{t('states.submittedOnce')} {state.detail} ({state.instrumentVersion} / {state.language} / {state.score})</p>
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
  const t = await getTranslations('posttest')
  const state = await readPosttestItemsViaTable()
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

async function PosttestForm({ locale }: { locale: string }) {
  const t = await getTranslations('posttest')
  return (
    <section>
      {/* The single submit posts the `ppg_posttest_submit` RPC once (the
        submit function re-gates the unlock + scores server-side + stamps
        `submitted_at`; a second submit reaches `already_submitted_or_missing`,
        never a silent overwrite). The hidden language field records the taken
        language with the row (ADR-0002) — the DATABASE re-validates th|en.
        The row start rides the submit route's gated, idempotent
        `ppg_posttest_start` call. #54: ONLY classes were added — fields,
        names, patterns and the `data-ppg-*` attrs are byte-identical to the
        shipped form. */}
      <div className="ppg-sc-panel">
        <form
          data-ppg-posttest-form="posttest"
          data-ppg-posttest-submit="true"
          aria-label={t('submitLabel')}
          method="POST"
          action="/api/posttest/submit"
        >
          <input name="language" defaultValue={locale === 'th' ? 'th' : 'en'} hidden={true} />
          <label className="ppg-field-label" htmlFor="posttest_answer_item_1">{t('answerLabel')}</label>
          <input className="ppg-input" id="posttest_answer_item_1" name="item_1" required pattern="^[A-D]$" />
          <div className="ppg-sc-cta-row">
            <button className="ppg-button" type="submit">{t('submitLabel')}</button>
          </div>
        </form>
      </div>
      <p>
        <Link className="ppg-link" href="/survey">{t('linkSurvey')}</Link>
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

export default async function PostTestPage() {
  const t = await getTranslations('posttest')
  const locale = await getLocale()
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <div className="ppg-page-wrap">
        <UnlockStatus />
        <Items locale={locale} />
        <PosttestForm locale={locale} />
      </div>
    </Suspense>
  )
}
