import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import { readGateViaTable, readItemsViaTable } from '../../../lib/sup/prettest'
import { Badge } from '../../../components/Badge'
import { PreTestItems } from '../../../components/PreTestItems'
import { StatusPill } from '../../../components/StatusPill'

/**
 * Ticket #8 Pre-Test, #54 V3 dressing, #83 per-item answers (the reads, the
 * gate machine, the SHIPPED form fields/patterns/`data-ppg-*` attrs and the
 * submit route are UNCHANGED): the instrument wearing the gallery's card/tag
 * idiom — the heading block (the 📝 title + the explicit no-XP subline), the
 * research/no-XP chips, each item a question card with the real
 * Question {n}/{total} progress chips + the seeded choice tiles (the tiles
 * PRESENT the choices; each item's answer rides its own compact text input,
 * `item_<n>`, inside the ONE submitted form — #83), and the submitted
 * receipt (the ✓ receipt heading, the immutable-once-submitted note + the
 * success pill; a second submit still reaches `already_submitted`, never a
 * silently-overwritten row). The instrument's items are the bilingual seeded
 * material the Learner sees; the answer key never reaches the browser (the
 * instrument's key-column policy denies a client SELECT; the score is the
 * submit function's server-side sum — never client-decided).
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
async function GateStatus({ state }: { state: Awaited<ReturnType<typeof readGateViaTable>> }) {
  const t = await getTranslations('pretest')
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
async function PreTestForm({ locale, state }: { locale: string; state: Awaited<ReturnType<typeof readItemsViaTable>> }) {
  const t = await getTranslations('pretest')
  const items = state.status === 'ok' ? state.items ?? [] : []
  return (
    <section aria-label={t('itemsLabel')} style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ppg-space-3)' }}>
      {/* The single submit rides the form's native elements so the keyboard
        reaches the control (login page's pattern). The submit posts the
        `ppg_prettest_submit` RPC once (the `data-ppg-pretest-submit` attr
        marks the submit-call target; a second submit reaches
        `already_submitted`, never a silent overwrite). PPGA #18: the gated
        row start (`ppg_prettest_start` — the #15-starter pattern; idempotent)
        rides first inside the submit route, so the response row the submit
        function UPDATEs exists. The hidden language field records the taken
        language with the row (ADR-0002) — the DATABASE re-validates th|en.
        #83: the form now WRAPS the item list so every `item_<n>` control is
        submitted; the route's `item_` filter and the server-side answer key
        already speak the same names. #54's `data-ppg-*` attrs and the
        `^[A-D]$` contract are unchanged. */}
      <div className="ppg-sc-panel">
        <form
          data-ppg-pretest-form="prettest"
          data-ppg-pretest-submit="true"
          aria-label={t('submitLabel')}
          method="POST"
          action="/api/prettest/submit"
        >
          <PreTestItems
            items={items}
            locale={locale}
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
  // Both reads are independent; one round-trip wave instead of two.
  const [gate, items] = await Promise.all([readGateViaTable(), readItemsViaTable()])
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <div className="ppg-page-wrap">
        <GateStatus state={gate} />
        <PreTestForm locale={locale} state={items} />
      </div>
    </Suspense>
  )
}
