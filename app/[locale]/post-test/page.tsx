import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import {
  readPosttestState,
  readPosttestItemsViaTable,
} from '../../../lib/sup/posttest'

/**
 * Ticket #15 Post-Test: the research close's second instrument — reachable as
 * a screen ONLY after the Final Project's ACCEPTANCE (the DATABASE's
 * `ppg_posttest_unlocked` — module-11 `complete`, written by the Teacher's
 * approval alone — is the authority; the items read rides the instrument's
 * policy and an early learner reaches `denied`, never a hidden UI; the submit
 * function re-gates as `final_project_not_accepted`, never a silently-early
 * instrument; ADR-0002). The instrument's items are the bilingual seeded
 * material the Learner sees; the answer key never reaches the browser (the
 * score is the submit function's server-side sum — never client-decided); the
 * instrument grants NO XP, NO badge — a research instrument never rewards
 * (ADR-0001). `force-dynamic` because the page reads the unlock + the items
 * through the session JWT — `next build` must never pre-render someone
 * else's state. Every state (`posttest.states.*`) has its own copy in
 * `messages`.
 */
export const dynamic = 'force-dynamic'

async function UnlockStatus() {
  const t = await getTranslations('posttest')
  const state = await readPosttestState()
  return (
    <section aria-label={t('gateLabel')}>
      {state.status === 'ok' && !state.unlocked ? <p>{t('states.locked')} {state.detail}</p> : null}
      {state.status === 'ok' && state.unlocked && !state.submitted ? <p>{t('states.unlocked')} {state.detail}</p> : null}
      {state.status === 'ok' && state.unlocked && state.submitted ? (
        <p>
          {t('states.submittedOnce')} {state.detail} ({state.instrumentVersion} / {state.language} / {state.score})
        </p>
      ) : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

async function Items({ locale }: { locale: string }) {
  const t = await getTranslations('posttest')
  const state = await readPosttestItemsViaTable()
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

async function PosttestForm({ locale }: { locale: string }) {
  const t = await getTranslations('posttest')
  return (
    <section>
      {/* The single submit posts the `ppg_posttest_submit` RPC once (the
        submit function re-gates the unlock + scores server-side + stamps
        `submitted_at`; a second submit reaches `already_submitted_or_missing`,
        never a silent overwrite). The hidden language field records the
        taken language with the row (ADR-0002) — the DATABASE re-validates
        th|en. The row start rides the submit route's gated, idempotent
        `ppg_posttest_start` call. */}
      <form
        data-ppg-posttest-form="posttest"
        data-ppg-posttest-submit="true"
        aria-label={t('submitLabel')}
        method="POST"
        action="/api/posttest/submit"
      >
        <input name="language" defaultValue={locale === 'th' ? 'th' : 'en'} hidden={true} />
        <label htmlFor="posttest_answer_item_1">{t('answerLabel')}</label>
        <input id="posttest_answer_item_1" name="item_1" required pattern="^[A-D]$" />
        <button type="submit">{t('submitLabel')}</button>
      </form>
      <p>
        <Link href="/survey">{t('linkSurvey')}</Link>
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

export default async function PostTestPage() {
  const t = await getTranslations('posttest')
  const locale = await getLocale()
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <UnlockStatus />
      <Items locale={locale} />
      <PosttestForm locale={locale} />
    </Suspense>
  )
}
