import { Suspense } from 'react'

import { useLocale, useTranslations } from 'next-intl'
import { Link } from '../../../../../lib/i18n/routing'

import { readMissionViaRpc, readMissionHistoryViaRpc } from '../../../../../lib/sup/missions'
import { Card } from '../../../../../components/Card'
import { Badge } from '../../../../../components/Badge'
import { StatusPill } from '../../../../../components/StatusPill'

/**
 * Ticket #11 Knowledge Mission attempt page: the Mission the module's
 * Lessons END into (the `ppg_read_mission` RPC — the bilingual
 * instructions + questions/options WITHOUT the answer key, gated
 * server-side: an ungated learner, a locked module or an un-passed
 * Self-Check returns `empty`, never a hidden form), the retry form (the
 * native POST to /api/mission/submit runs the `ppg_submit_mission` RPC —
 * the DATABASE's own answer-key sum at the 70% pass threshold decides
 * pass/fail server-side; unlimited retries below the threshold), the
 * attempt history shown (the `ppg_mission_history` RPC — the score
 * history RETAINED append-only across attempts, the CALLER's own rows),
 * and the +100/Module-badge notes the ledger/award PKs speak (exactly-
 * once grants; the completion hook unlocks module N+1 server-side).
 * `force-dynamic` because the page reads through the session JWT. Every
 * state (`mission.section`, `mission.states.*`, `mission.linkModule`,
 * `mission.linkMap`, `mission.fallbackSuspense`) has its own copy in
 * `messages`.
 */
export const dynamic = 'force-dynamic'

async function MissionAttempt({ moduleKey }: { moduleKey: string }) {
  const t = useTranslations('mission')
  const locale = useLocale()
  const state = await readMissionViaRpc(moduleKey)
  const history = await readMissionHistoryViaRpc(moduleKey)
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  return (
    <section aria-label={t('section')}>
      {state.status === 'ok' && state.instructions
        ? (
          <>
            <Card
              heading={t('instructionsHeading')}
              body={pick(state.instructions.instructions_th, state.instructions.instructions_en)}
              status="available"
            />
            <form method="POST" action="/api/mission/submit" data-ppg-mission-form="mission" aria-label={t('submitLabel')}>
              <input name="module_key" defaultValue={moduleKey} hidden={true} />
              {state.questions
                ?.sort((a, b) => a.order_index - b.order_index || a.option_key.charCodeAt(0) - b.option_key.charCodeAt(0))
                .map((q) => (
                  <label key={`${q.module_key}-${q.order_index}-${q.option_key}`} htmlFor={`answer_${q.order_index}`}>
                    <input type="radio" id={`answer_${q.order_index}_${q.option_key}`} name={`answer_${q.order_index}`} defaultValue={q.option_key} />
                    <span aria-hidden="true">{q.option_key}</span> {pick(q.option_th, q.option_en)}
                    {pick(q.prompt_th, q.prompt_en)}
                  </label>
                ))}
              <button type="submit">{t('submitLabel')}</button>
            </form>
            <p>{t('retryHint')}</p>
            <p>
              <StatusPill tone="success" label={t('passState')} />
              <Badge text={t('badgeNote')} tone="success" />
            </p>
            <p>{t('failNote')}</p>
          </>
        )
        : null}

      {history.status === 'ok' && history.attempts
        ? (
          <section aria-label={t('historySection')}>
            <h2>{t('historySection')}</h2>
            <table>
              <thead>
                <tr>
                  <td>{t('historyAttempt')}</td>
                  <td>{t('historyScore')}</td>
                  <td>{t('historyOutcome')}</td>
                </tr>
              </thead>
              <tbody>
                {history.attempts.map((a) => (
                  <tr key={`${a.module_key}-${a.attempt_seq}`} aria-label={`${t('historyAttempt')} ${a.attempt_seq}, ${a.score_pct}% ${a.outcome}`}>
                    <td>{a.attempt_seq}</td>
                    <td>{a.score_pct}</td>
                    <td>{a.outcome}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </section>
        )
        : null}

      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      {history.status === 'empty' ? <p>{t('states.historyEmpty')} {history.detail}</p> : null}
      {history.status === 'error' ? <p>{t('states.error')} {history.detail}</p> : null}
      {history.status === 'not-configured' ? <p>{t('states.notConfigured')} {history.detail}</p> : null}
      {history.status === 'unauthorized' ? <p>{t('states.unauthorized')} {history.detail}</p> : null}

      <p>
        <Link href={{ pathname: '/course/[moduleKey]', params: { moduleKey } }}>{t('linkModule')}</Link>
      </p>
      <p>
        <Link href="/course">{t('linkMap')}</Link>
      </p>
    </section>
  )
}

export default function MissionPage({ params }: { params: { moduleKey: string } }) {
  const t = useTranslations('mission')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <MissionAttempt moduleKey={params.moduleKey} />
    </Suspense>
  )
}
