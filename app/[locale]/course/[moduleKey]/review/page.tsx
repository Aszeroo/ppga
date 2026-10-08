import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../../lib/i18n/routing'

import { readLatestReviewViaRpc } from '../../../../../lib/sup/reviews'
import { readSubmissionHistoryViaRpc } from '../../../../../lib/sup/submissions'
import { readChallengeReads } from '../../../../../lib/sup/challenge'
import { buildChallengeContext, challengeTrackSteps, rewardChipProps } from '../../../../../lib/challengeStages'
import { Card } from '../../../../../components/Card'
import { StatusPill } from '../../../../../components/StatusPill'
import { ChallengeTrack } from '../../../../../components/ChallengeTrack'
import { XpRewardChip } from '../../../../../components/XpRewardChip'

/**
 * Ticket #14 the LEARNER's review result page (#45 stage-4 framing on top):
 * the latest review verdict on the Mission (the decision approved |
 * needs_improvement, the 7 criterion scores 1–5 each, the SERVER-computed
 * total 7–35, the bilingual written feedback) + the append-only per-round
 * history (`ppg_read_latest_review` — the CALLER's own rows ONLY; an other
 * learner's reviews NEVER ride out; ADR-0002 the past rows NEVER move). The
 * #45 framing adds ONLY presentation on the stage-map vocabulary: the
 * Lesson → Self-Check → Mission → Result CHALLENGE TRACK (the Result step is
 * the surface the learner stands on — cleared only by the REAL approval,
 * open while a real round awaits the Teacher) + the XP reward chip riding
 * the learner's OWN approval/final-project LEDGER row (real amount — a
 * needs_improvement round shows NO grant, because none landed).
 * `force-dynamic` because the read rides the session JWT. Every state
 * (`review.latestResultHeading`, `review.states.*`, `challenge.*`) has its
 * own copy in `messages/{en,th}.json`.
 */
export const dynamic = 'force-dynamic'

async function LearnerReviewResult({ moduleKey }: { moduleKey: string }) {
  const t = await getTranslations('review')
  const tC = await getTranslations('challenge')
  const locale = await getLocale()
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)

  const latest = await readLatestReviewViaRpc(moduleKey)
  const history = await readSubmissionHistoryViaRpc(moduleKey)
  const ctx = buildChallengeContext(
    moduleKey,
    await readChallengeReads(moduleKey),
    { submissionExists: history.status === 'ok' && (history.submissions ?? []).length > 0 },
  )
  // the learner STANDS on the Result step here — it wears no self-link.
  const trackSteps = challengeTrackSteps(ctx, moduleKey, {
    title: (key) => tC(`steps.${key}`),
    state: (stateNow) => tC(`states.${stateNow}`),
    current: tC('current'),
  }, { unlinkedStep: 'result' })
  const reward = rewardChipProps(ctx, tC('rewardNote'))

  return (
    <section aria-label={t('latestResultHeading')}>
      <ChallengeTrack label={tC('trackLabel')} steps={trackSteps} />
      <h1 className="ppg-heading ppg-heading-text">{t('latestResultHeading')}</h1>

      {latest.status === 'ok' && latest.latest ? (
        <>
          {/** The verdict card: the SHIPPED `Card` primitive stays (its
         * inline authority carries the V3 token surfaces + the `.ppg-card`
         * focus/reduced-motion join) — the repo's lint does NOT forgive an
         * unused import and the guard suite reads this import line. */}
          <Card
            heading={`${t('latestResultHeading')} — ${latest.latest.decision === 'approved' ? t('approve') : t('needsImprovement')}`}
            body={`${t('totalScore')}: ${latest.latest.total_score} / 35 — ${pick(latest.latest.feedback_th ?? '', latest.latest.feedback_en ?? '')}`}
            status="available"
          />
          {reward
            ? (
              <p>
                <XpRewardChip {...reward} />
              </p>
            )
            : null}
          <section aria-label={t('historyHeading')}>
            <h2 className="ppg-heading ppg-heading-text">{t('historyHeading')}</h2>
            {/** The append-only round table rides the shipped console face
         * (`ppg-table-wrap` + `ppg-table` + `<th scope="col">` on every
         * header). */}
            <div className="ppg-table-wrap">
              <table className="ppg-table">
                <thead>
                  <tr>
                    <th scope="col">{t('round')}</th>
                    <th scope="col">{t('decision')}</th>
                    <th scope="col">{t('totalScore')}</th>
                    <th scope="col">{t('feedbackHeading')}</th>
                  </tr>
                </thead>
                <tbody>
                  {latest.history.map((row) => (
                    <tr
                      key={`${row.mission_id}-${row.submission_seq}`}
                      aria-label={`${t('round')} ${row.submission_seq}, ${row.decision}`}
                    >
                      <td>{row.submission_seq}</td>
                      <td>{row.decision}</td>
                      <td>{row.total_score}</td>
                      <td>{pick(row.feedback_th ?? '—', row.feedback_en ?? '—')}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        </>
      ) : latest.status === 'empty' ? (
        <p>
          <StatusPill tone="locked" label={t('noReviewYet')} />
        </p>
      ) : latest.status === 'ok' ? (
        null
      ) : latest.status === 'denied' ? (
        <p className="ppg-state-line">{t('queueDenied')} {latest.detail}</p>
      ) : latest.status === 'unauthorized' ? (
        <p className="ppg-state-line">{t('queueUnauthorized')} {latest.detail}</p>
      ) : latest.status === 'not-configured' ? (
        <p className="ppg-state-line">{t('queueNotConfigured')} {latest.detail}</p>
      ) : (
        <p className="ppg-state-line">{t('queueError')} {latest.detail}</p>
      )}

      <p>
        <Link
          href={{ pathname: '/course/[moduleKey]/practical', params: { moduleKey } }}
          className="ppg-link"
        >
          {t('backToQueue')}
        </Link>
      </p>
      <p>
        <Link
          href={{ pathname: '/course/[moduleKey]', params: { moduleKey } }}
          className="ppg-link"
        >
          {t('linkModule')}
        </Link>
      </p>
    </section>
  )
}

export default async function ReviewPage({ params }: { params: Promise<{ moduleKey: string }> }) {
  const t = await getTranslations('review')
  const { moduleKey } = await params
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <LearnerReviewResult moduleKey={moduleKey} />
    </Suspense>
  )
}
