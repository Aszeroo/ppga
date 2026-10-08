import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../../lib/i18n/routing'

import { readMissionViaRpc, readMissionHistoryViaRpc } from '../../../../../lib/sup/missions'
import { readChallengeReads } from '../../../../../lib/sup/challenge'
import { buildChallengeContext, challengeCopyFrom, challengePanelView, challengeTrackSteps } from '../../../../../lib/challengeStages'
import { Card } from '../../../../../components/Card'
import { ChallengeTrack } from '../../../../../components/ChallengeTrack'
import { MissionPanel } from '../../../../../components/MissionPanel'
import { RewardCelebration } from '../../../../../components/RewardCelebration'

/**
 * Ticket #11 Knowledge Mission attempt page (#45 stage-4 framing; V3 panel
 * dress for #53): the Mission the module's Lessons END into (the
 * `ppg_read_mission` RPC — the bilingual instructions + questions/options
 * WITHOUT the answer key, gated server-side: an ungated learner, a locked
 * module or an un-passed Self-Check returns `empty`, never a hidden form),
 * the retry form (the native POST to /api/mission/submit runs the
 * `ppg_submit_mission` RPC — the DATABASE's own answer-key sum at the 70%
 * pass threshold decides pass/fail server-side; unlimited retries below the
 * threshold), the attempt history shown (the `ppg_mission_history` RPC —
 * the score history RETAINED append-only across attempts, the CALLER's own
 * rows), and the +100/Module-badge notes the ledger/award PKs speak
 * (exactly-once grants; the completion hook unlocks module N+1 server-side).
 * The #53 dress: the attempt rides the V3 option rows (the Self-Check's own
 * `.ppg-sc-opt` vocabulary — the real radio stays the whole control, the
 * letter tile the face), the ONE primary CTA per context (the form submit
 * on `.ppg-cta`), the pass/award notes as V3 form notes + the gold status
 * card (the success-tone pre-pass pill is GONE — it read like a grant it
 * never was, the #52 lesson-page precedent), and the score history in the
 * V3 table face. Every state stays server-read truth.
 * Every state (`mission.section`, `mission.states.*`, `mission.linkModule`,
 * `mission.linkMap`, `mission.fallbackSuspense`, `challenge.*`) has its own
 * copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function MissionAttempt({ moduleKey }: { moduleKey: string }) {
  const t = await getTranslations('mission')
  const tC = await getTranslations('challenge')
  const tR = await getTranslations('reward')
  const locale = await getLocale()
  const state = await readMissionViaRpc(moduleKey)
  const history = await readMissionHistoryViaRpc(moduleKey)
  const ctx = buildChallengeContext(moduleKey, await readChallengeReads(moduleKey))
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  const copy = challengeCopyFrom(tC)
  const view = challengePanelView(ctx, { status: state.status, hasContent: !!state.instructions }, copy, locale)
  const trackSteps = challengeTrackSteps(ctx, moduleKey, copy)
  return (
    <section aria-label={t('section')} className="ppg-page-wrap">
      <ChallengeTrack label={tC('trackLabel')} steps={trackSteps} />

      {view.panel && state.instructions
        ? (
          <>
          <MissionPanel
            state={view.panel}
            stateCopy={view.stateCopy}
            heading={t('section')}
            panelLabel={t('section')}
            reward={view.reward}
            unlocked={view.unlocked}
          >
            <Card
              heading={t('instructionsHeading')}
              body={pick(state.instructions.instructions_th, state.instructions.instructions_en)}
              status="available"
            />
            <form method="POST" action="/api/mission/submit" className="ppg-mission-form" data-ppg-mission-form="mission" aria-label={t('submitLabel')}>
              <input name="module_key" defaultValue={moduleKey} hidden={true} />
              <div className="ppg-sc-options">
                {state.questions
                  ?.sort((a, b) => a.order_index - b.order_index || a.option_key.charCodeAt(0) - b.option_key.charCodeAt(0))
                  .map((q) => {
                    // The shipped name/value/keyboard semantics are UNCHANGED;
                    // the #52-B finding is honoured: the label points at the
                    // radio's REAL id (the old `answer_<i>` never matched).
                    const optionId = `answer_${q.order_index}_${q.option_key}`
                    return (
                      <label key={`${q.module_key}-${q.order_index}-${q.option_key}`} className="ppg-sc-opt" htmlFor={optionId}>
                        <input type="radio" id={optionId} className="ppg-sc-opt-radio" name={`answer_${q.order_index}`} defaultValue={q.option_key} />
                        <span className="ppg-sc-opt-letter" aria-hidden="true">{q.option_key}</span>
                        <span className="ppg-sc-opt-text">
                          {pick(q.option_th, q.option_en)} {pick(q.prompt_th, q.prompt_en)}
                        </span>
                      </label>
                    )
                  })}
              </div>
              <div className="ppg-sc-cta-row">
                <button type="submit" className="ppg-cta" data-ppg-cta="primary">{t('submitLabel')}</button>
              </div>
            </form>
            <p className="ppg-mission-note">{t('retryHint')}</p>
            {view.cleared
              ? (
                /* The award the ledger already wrote, on the gallery's gold
                   status card — copy + marker truth, the Badge chip's old
                   success tone retires in favour of the V3 card face. */
                <div className="ppg-status-card ppg-strip-top">
                  <p className="ppg-status-card-title">
                    <span aria-hidden="true">🏅 </span>
                    {t('badgeNote')}
                  </p>
                </div>
              )
              : (
                <>
                  {/* Pre-pass rules as honest V3 notes — the shipped copy
                      says what passing IS (+100, once) and what a below-70%
                      attempt IS (retry freely); no success-tone pill that
                      could read like a grant before one exists. */}
                  <p className="ppg-mission-note">
                    <span aria-hidden="true">✓ </span>
                    {t('passState')}
                  </p>
                  <p className="ppg-mission-note">
                    <span aria-hidden="true">↺ </span>
                    {t('failNote')}
                  </p>
                </>
              )}
          </MissionPanel>
          {/* #53: the reward-moment popup over the SAME server reads the
              panel renders (the real grant row + the real unlock band) —
              once per browser per identity, dismissable, and it adds NO
              `.ppg-cta`, NO success-tone pill and NO duplicate `data-ppg-*`
              marker, so the page's journey gates stay exactly as they are. */}
          <RewardCelebration
            reward={view.reward}
            unlocked={view.unlocked}
            copy={{ title: tR('title'), dismiss: tR('dismiss') }}
          />
          </>
        )
        : null}

      {history.status === 'ok' && history.attempts
        ? (
          <section aria-label={t('historySection')}>
            <h2 className="ppg-list-title">{t('historySection')}</h2>
            <div className="ppg-table-wrap">
              <table className="ppg-table">
                <thead>
                  <tr>
                    <th scope="col">{t('historyAttempt')}</th>
                    <th scope="col">{t('historyScore')}</th>
                    <th scope="col">{t('historyOutcome')}</th>
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
            </div>
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
        <Link href={{ pathname: '/course/[moduleKey]', params: { moduleKey } }} className="ppg-link">{t('linkModule')}</Link>
      </p>
      <p>
        <Link href="/course" className="ppg-link">{t('linkMap')}</Link>
      </p>
    </section>
  )
}

export default async function MissionPage({ params }: { params: Promise<{ moduleKey: string }> }) {
  const t = await getTranslations('mission')
  const { moduleKey } = await params
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <MissionAttempt moduleKey={moduleKey} />
    </Suspense>
  )
}
