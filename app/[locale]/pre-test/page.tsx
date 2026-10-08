import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import { readGateViaTable, readItemsViaTable } from '../../../lib/sup/prettest'
import { Badge } from '../../../components/Badge'
import { StatusPill } from '../../../components/StatusPill'

/**
 * Ticket #8 Pre-Test, #54 V3 dressing (presentation only — the reads, the
 * gate machine, the SHIPPED form fields/patterns/`data-ppg-*` attrs and the
 * submit route are UNCHANGED): the instrument wearing the gallery's card/tag
 * idiom — the heading block (the 📝 title + the explicit no-XP subline), the
 * research/no-XP chips, each item a question card with the real
 * Question {n}/{total} progress chips + the seeded choice tiles (the tiles
 * PRESENT the choices; the answer still rides the shipped text input — no
 * new control), and the submitted receipt (the ✓ receipt heading, the
 * immutable-once-submitted note + the success pill; a second submit still
 * reaches `already_submitted`, never a silently-overwritten row). The
 * instrument's items are the bilingual seeded material the Learner sees; the
 * answer key never reaches the browser (the instrument's key-column policy
 * denies a client SELECT; the score is the submit function's server-side
 * sum — never client-decided).
 *
 * `force-dynamic` because the page reads the gate + the items through
 * the session JWT — `next build` must never pre-render someone else's
 * gate state. The autosave (debounced save calls the upsupert RPC
 * BEFORE a submit only; resumable after an interrupted session) + the
 * single submit (the submit function scores + stamps `submitted_at`
 * atomically; a second submit reaches `already_submitted`, never a
 * silently-overwritten row) all speak the DATABASE's own authority.
 * Every state (`pretest.states.{ok|empty|error|denied|unauthorized|
 * notConfigured}`, `pretest.consent`, `pretest.submittedOnce`,
 * `pretest.autosave`) has its own copy in `messages`; the V3 dressing's NEW
 * copy (`pretest.researchTag/noXpTag/instrumentHeading/noXpSub/questionTag/
 * itemProgress/receiptHeading/immutableNote/immutableTag`) rides the same
 * file in BOTH locales.
 */
export const dynamic = 'force-dynamic'

// fallow-ignore-next-line complexity
async function GateStatus() {
  const t = await getTranslations('pretest')
  const state = await readGateViaTable()
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
          {t('noXpSub')}
        </p>
        <p style={{ display: 'flex', gap: 'var(--ppg-space-2)', flexWrap: 'wrap', justifyContent: 'center' }}>
          <Badge text={t('researchTag')} tone="neutral" />
          <Badge text={t('noXpTag')} tone="warning" />
        </p>
      </div>

      {state.status === 'ok' && !state.consent && !state.override ? <p className="ppg-state-line">{t('states.noConsent')} {state.detail}</p> : null}
      {state.status === 'ok' && state.consent && !state.submitted ? <p className="ppg-state-line">{t('states.consentNoSubmit')} {state.detail}</p> : null}
      {state.status === 'ok' && (state.submitted || state.override) ? <p className="ppg-state-line">{t('states.gateOpen')} {state.detail}</p> : null}

      {state.status === 'ok' && state.submitted ? (
        <div className="ppg-instr-receipt">
          <h2 className="ppg-sc-result-title">{'✓ '}<span>{t('receiptHeading')}</span></h2>
          <p>{t('states.score')} {state.detail} ({state.instrumentVersion} / {state.language} / {state.score})</p>
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
async function Items({ locale }: { locale: string }) {
  const t = await getTranslations('pretest')
  const state = await readItemsViaTable()
  const items = state.status === 'ok' ? state.items ?? [] : []
  const total = items.length
  return (
    <section aria-label={t('itemsLabel')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ppg-space-3)' }}>
      {state.status === 'ok'
        ? items.map((item: { id: string; th: { prompt: string; choices: Record<string, string> }; en: { prompt: string; choices: Record<string, string> } }, i: number) => {
          const choiceSet = locale === 'th' ? item.th.choices : item.en.choices
          return (
            <div key={item.id} className="ppg-instr-item">
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--ppg-space-2)', flexWrap: 'wrap' }}>
                <Badge text={`${t('questionTag')} ${i + 1}`} tone="neutral" />
                <Badge text={t('itemProgress', { n: String(i + 1), total: String(total) })} tone="neutral" />
              </div>
              <p className="ppg-sc-question">{item.th.prompt}</p>
              <p className="ppg-card-text">{item.en.prompt}</p>
              <div className="ppg-sc-options">
                {Object.entries(choiceSet ?? {}).map(([letter, text]) => (
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

async function PreTestForm({ locale }: { locale: string }) {
  const t = await getTranslations('pretest')
  return (
    <section>
      {/* The single submit rides the form's native elements so the keyboard
        reaches the control (login page's pattern). The submit posts the
        `ppg_prettest_submit` RPC once (the `data-ppg-pretest-submit` attr
        marks the submit-call target; a second submit reaches
        `already_submitted`, never a silent overwrite). PPGA #18: the gated
        row start (`ppg_prettest_start` — the #15-starter pattern; idempotent)
        rides first inside the submit route, so the response row the submit
        function UPDATEs exists. The hidden language field records the taken
        language with the row (ADR-0002) — the DATABASE re-validates th|en.
        #54: ONLY classes were added — fields, names, patterns and the
        `data-ppg-*` attrs are byte-identical to the shipped form. */}
      <div className="ppg-sc-panel">
        <form
          data-ppg-pretest-form="prettest"
          data-ppg-pretest-submit="true"
          aria-label={t('submitLabel')}
          method="POST"
          action="/api/prettest/submit"
        >
          <label className="ppg-field-label" htmlFor="prettest_answer_item_1">{t('answerLabel')}</label>
          {/* PPGA #18 (finding #6): the shipped pattern `^[ABCD]\{...}?$` matched a
            LITERAL brace — a plain letter (the answer shape the server accepts,
            the same `^[A-D]$` the Post-Test carries) failed browser validation and
            the native submit silently never fired. The letters + server key remain
            the authority; this only lets the learner's click reach the route. */}
          <input className="ppg-input" id="prettest_answer_item_1" name="item_1" required pattern="^[A-D]$" />
          <input name="language" defaultValue={locale === 'th' ? 'th' : 'en'} hidden={true} />
          <div className="ppg-sc-cta-row">
            <button className="ppg-button" type="submit">{t('submitLabel')}</button>
          </div>
        </form>
      </div>
      <p>
        <Link className="ppg-link" href="/content">{t('linkContent')}</Link>
      </p>
      <p>
        <Link className="ppg-link" href="/">{t('linkDashboard')}</Link>
      </p>
    </section>
  )
}

export default async function PreTestPage() {
  const t = await getTranslations('pretest')
  const locale = await getLocale()
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <div className="ppg-page-wrap">
        <GateStatus />
        <Items locale={locale} />
        <PreTestForm locale={locale} />
      </div>
    </Suspense>
  )
}
