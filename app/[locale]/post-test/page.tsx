import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import {
  readPosttestItemsViaTable,
  readFinalTestState,
  readPosttestState,
} from '../../../lib/sup/posttest'
import { Badge } from '../../../components/Badge'
import { InstrumentItems } from '../../../components/PreTestItems'
import { StatusPill } from '../../../components/StatusPill'

/**
 * The Final Test screen (#84, the Close of the CAI course): the #15 engine
 * with a comprehensive 50-item instrument and retry-aware attempts. The
 * reads, the unlock machine, the SHIPPED form field names (`item_<n>`), the
 * `^[A-D]$` contract and the `data-ppg-*` attrs are unchanged; the item list
 * now renders INSIDE the one submitted form (one required radio group per
 * item, `posttest_answer_item_<n>_<key>`) so every answer reaches the submit
 * route.
 *
 * Retries: the first submitted attempt is the research measure and never
 * changes; later submits append attempts and only the best score is shown.
 * The reward (400 XP + final_test_complete) is granted by the submit definer
 * exactly once, idempotent across retries. The answer key never reaches the
 * browser: the submit function scores it server-side and the key column has
 * no client SELECT grant.
 *
 * `force-dynamic` because the page reads the unlock, the items and the state
 * through the session JWT — `next build` must never pre-render someone else's
 * state.
 */
export const dynamic = 'force-dynamic'

async function UnlockStatus({ state, finalState }: {
  state: Awaited<ReturnType<typeof readPosttestState>>
  finalState: Awaited<ReturnType<typeof readFinalTestState>>
}) {
  const t = await getTranslations('posttest')
  return (
    <section aria-label={t('gateLabel')}>
      {/** The course/badges header pattern: left-aligned ink title, the
       * secondary line under it, the research/no-XP tags aligned beside. */}
      <div className="ppg-gallery-head">
        <div>
          <h1 className="ppg-heading ppg-heading-text ppg-gallery-title">
            {t('instrumentHeading')}
          </h1>
          {state.status === 'ok' && state.unlocked ? (
            <p className="ppg-card-text">{t('unlockedSub')}</p>
          ) : null}
        </div>
        <div className="ppg-gallery-counts">
          <Badge text={t('researchTag')} tone="neutral" />
          <Badge text={t('noXpTag')} tone="warning" />
        </div>
      </div>

      {state.status === 'ok' && !state.unlocked ? <p className="ppg-state-line">{t('states.locked')} {state.detail}</p> : null}
      {state.status === 'ok' && state.unlocked && !state.submitted ? <p className="ppg-state-line">{t('states.unlocked')} {state.detail}</p> : null}

      {state.status === 'ok' && state.unlocked && state.submitted ? (
        <div className="ppg-instr-receipt">
          <h2 className="ppg-sc-result-title">{'✓ '}<span>{t('receiptHeading')}</span></h2>
          <p>
            {t('states.submittedOnce')} ({t('firstScoreLabel')}: {state.score})
          </p>
          <p>
            {t('bestScoreLabel')}: {finalState?.best_score ?? state.score} · {t('attemptsLabel')}: {finalState?.attempts ?? 1}
          </p>
          <p>{t('retryNote')}</p>
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
async function PosttestForm({ locale, itemsState }: { locale: string; itemsState: Awaited<ReturnType<typeof readPosttestItemsViaTable>> }) {
  const t = await getTranslations('posttest')
  const items = itemsState.status === 'ok' ? itemsState.items ?? [] : []
  return (
    <section aria-label={t('itemsLabel')}>
      {/* The single submit rides the native form. #84 moves the item list
        INSIDE it: one required `item_<n>` radio group per item, named exactly
        like the server-side key, so the route's `item_` filter forwards a
        complete payload. The seeded choice rows are the controls; the
        answer key never reaches the browser. The submit function scores
        server-side, stamps the attempt immutably, and calls the one-time
        reward helper. #54's `data-ppg-*` attrs and the unique
        `posttest_answer_item_<n>_<key>` ids are preserved. */}
      <div className="ppg-sc-panel">
        <form
          data-ppg-posttest-form="posttest"
          data-ppg-posttest-submit="true"
          aria-label={t('submitLabel')}
          method="POST"
          action="/api/posttest/submit"
        >
          <InstrumentItems
            items={items}
            locale={locale}
            answerIdPrefix="posttest"
            questionTag={(n) => t('questionTag', { n: String(n) })}
            itemProgress={(n, total) => t('itemProgress', { n: String(n), total: String(total) })}
            answerForQuestion={(n) => `${t('answerLabel')} ${n}`}
          />
          <input name="language" defaultValue={locale === 'th' ? 'th' : 'en'} hidden={true} />
          <div className="ppg-sc-cta-row">
            <button className="ppg-button" type="submit">{t('submitLabel')}</button>
          </div>
        </form>
      </div>
      {itemsState.status === 'empty' ? <p className="ppg-state-line">{t('states.itemsEmpty')} {itemsState.detail}</p> : null}
      {itemsState.status === 'error' ? <p className="ppg-state-line">{t('states.itemsError')} {itemsState.detail}</p> : null}
      {itemsState.status === 'denied' ? <p className="ppg-state-line">{t('states.denied')} {itemsState.detail}</p> : null}
      {itemsState.status === 'unauthorized' ? <p className="ppg-state-line">{t('states.unauthorized')} {itemsState.detail}</p> : null}
      {itemsState.status === 'not-configured' ? <p className="ppg-state-line">{t('states.notConfigured')} {itemsState.detail}</p> : null}
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
  // The unlock state, the aggregate and the 50 items are independent reads.
  const [state, finalState, itemsState] = await Promise.all([
    readPosttestState(),
    readFinalTestState(),
    readPosttestItemsViaTable(),
  ])
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <div className="ppg-page-wrap">
        <UnlockStatus state={state} finalState={finalState} />
        <PosttestForm locale={locale} itemsState={itemsState} />
      </div>
    </Suspense>
  )
}
