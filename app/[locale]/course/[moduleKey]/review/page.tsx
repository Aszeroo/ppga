import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../../lib/i18n/routing'

import { readLatestReviewViaRpc } from '../../../../../lib/sup/reviews'
import { Card } from '../../../../../components/Card'
import { StatusPill } from '../../../../../components/StatusPill'

/**
 * Ticket #14 the LEARNER's review result page: the latest review verdict on the
 * Mission (the decision approved | needs_improvement, the 7 criterion scores
 * 1–5 each, the SERVER-computed total 7–35, the bilingual written feedback) +
 * the append-only per-round history (`ppg_read_latest_review` — the CALLER's
 * own rows ONLY; an other learner's reviews NEVER ride out; ADR-0002 the past
 * rows NEVER move). `force-dynamic` because the read rides the session JWT.
 * Every state (`review.latestResultHeading`, `review.states.*`) has its own
 * copy in `messages/{en,th}.json`.
 */
export const dynamic = 'force-dynamic'

async function LearnerReviewResult({ moduleKey }: { moduleKey: string }) {
  const t = await getTranslations('review')
  const locale = await getLocale()
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)

  const latest = await readLatestReviewViaRpc(moduleKey)

  return (
    <section aria-label={t('latestResultHeading')}>
      <h1 className="ppg-heading">{t('latestResultHeading')}</h1>

      {latest.status === 'ok' && latest.latest ? (
        <>
          <Card
            heading={`${t('latestResultHeading')} — ${latest.latest.decision === 'approved' ? t('approve') : t('needsImprovement')}`}
            body={`${t('totalScore')}: ${latest.latest.total_score} / 35 — ${pick(latest.latest.feedback_th ?? '', latest.latest.feedback_en ?? '')}`}
            status="available"
          />
          <section aria-label={t('historyHeading')}>
            <h2>{t('historyHeading')}</h2>
            <table>
              <thead>
                <tr>
                  <td>{t('round')}</td>
                  <td>{t('decision')}</td>
                  <td>{t('totalScore')}</td>
                  <td>{t('feedbackHeading')}</td>
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
          </section>
        </>
      ) : latest.status === 'empty' ? (
        <p>
          <StatusPill tone="locked" label={t('noReviewYet')} />
        </p>
      ) : latest.status === 'ok' ? (
        null
      ) : latest.status === 'denied' ? (
        <p>{t('queueDenied')} {latest.detail}</p>
      ) : latest.status === 'unauthorized' ? (
        <p>{t('queueUnauthorized')} {latest.detail}</p>
      ) : latest.status === 'not-configured' ? (
        <p>{t('queueNotConfigured')} {latest.detail}</p>
      ) : (
        <p>{t('queueError')} {latest.detail}</p>
      )}

      <p>
        <Link href={{ pathname: '/course/[moduleKey]/practical', params: { moduleKey } }}>
          {t('backToQueue')}
        </Link>
      </p>
      <p>
        <Link href={{ pathname: '/course/[moduleKey]', params: { moduleKey } }}>
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
