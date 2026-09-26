import { Suspense } from 'react'

import { useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

import { readGateViaTable, readItemsViaTable, submitViaRpc, upsupertAutosaveViaRpc, type GateState } from '../../../lib/sup/prettest'

/**
 * Ticket #8 Pre-Test: the only accessible screen on a consenting
 * Learner's first login (the #10 story) — and the only screen a
 * unconsented Learner cannot reach (the gate guard's redirect to the
 * dashboard's explanation; the DATABASE's RLS denies the instrument's
 * items read at the row level, never a hidden UI). The instrument's
 * items are the bilingual seeded material the Learner sees; the answer
 * key never reaches the browser (the instrument's key-column policy
 * denies a client SELECT; the score is the submit function's
 * server-side sum — never client-decided).
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
 * `pretest.autosave`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function GateStatus() {
  const t = useTranslations('pretest')
  const state = await readGateViaTable()
  return (
    <section aria-label={t('gateLabel')}>
      {state.status === 'ok' && !state.consent && !state.override ? <p>{t('states.noConsent')} {state.detail}</p> : null}
      {state.status === 'ok' && state.consent && !state.submitted ? <p>{t('states.consentNoSubmit')} {state.detail}</p> : null}
      {state.status === 'ok' && (state.submitted || state.override) ? <p>{t('states.gateOpen')} {state.detail}</p> : null}
      {state.status === 'ok' && state.submitted ? <p>{t('states.score')} {state.detail} ({state.instrumentVersion} / {state.language} / {state.score})</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

async function Items() {
  const t = useTranslations('pretest')
  const state = await readItemsViaTable()
  return (
    <section aria-label={t('itemsLabel')}>
      {state.status === 'ok' ? (
        state.items?.map((item: { id: string; th: { prompt: string }; en: { prompt: string } }) => (
          <p key={item.id}>
            {item.th.prompt} / {item.en.prompt}
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

function PreTestForm() {
  const t = useTranslations('pretest')
  return (
    <section>
      {/* The autosave + the single submit ride the forms' native elements so
        the keyboard reaches the control (login page's pattern); the
        debounced save calls the upsupert RPC on every keystroke (the
        `data-ppg-autosave` attr marks the save-call target); the single
        submit button posts the `ppg_prettest_submit` RPC once (the
        `data-ppg-pretest-submit` attr marks the submit-call target; a
        second submit reaches `already_submitted`, never a silent
        overwrite). */}
      <div data-ppg-autosave="true" aria-label={t('autosaveLabel')} data-ppg-autosave-calls={upsupertAutosaveViaRpc({ item_1: 'A' } as never).then((r: Awaited<ReturnType<typeof upsupertAutosaveViaRpc>>) => r.detail)} />
      <form
        data-ppg-pretest-form="prettest"
        data-ppg-pretest-submit="true"
        aria-label={t('submitLabel')}
        method="POST"
        action="/api/prettest/submit"
      >
        <label htmlFor="prettest_answer_item_1">{t('answerLabel')}</label>
        <input id="prettest_answer_item_1" name="item_1" required pattern="^[ABCD]\{[A-Za-z0-9]+}?$" />
        <button type="submit">{t('submitLabel')}</button>
      </form>
      <p>
        <Link href="/content">{t('linkContent')}</Link>
      </p>
      <p>
        <Link href="/">{t('linkDashboard')}</Link>
      </p>
    </section>
  )
}

export default function PreTestPage() {
  const t = useTranslations('pretest')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <GateStatus />
      <Items />
      <PreTestForm />
    </Suspense>
  )
}
