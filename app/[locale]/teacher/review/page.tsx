import { Suspense } from 'react'

import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Link } from '../../../../lib/i18n/routing'

import { readReviewQueueViaRpc } from '../../../../lib/sup/reviews'
import { Card } from '../../../../components/Card'
import { StatusPill } from '../../../../components/StatusPill'

/**
 * Ticket #14 teacher review queue: the submissions whose status rides
 * `submitted` (pending review; the learner name + the Mission + the round;
 * the oldest round first — `ppg_review_queue`). The teacher/admin-only gate
 * speaks server-side (a learner who reaches the pathname rides `denied`,
 * never a UI-only hide). `force-dynamic` because the queue reads through the
 * session JWT — `next build` must never pre-render someone else's queue.
 * Every state (`review.*`) has its own copy in `messages/{en,th}.json`.
 */
export const dynamic = 'force-dynamic'

async function TeacherQueue() {
  const t = await getTranslations('review')

  // the queue across the practical missions 08–11 (the Final Project rides
  // the same review machinery, #15): one read per mission, the RPC's gate
  // (denied_role) is the authority — a learner's read NEVER yields a queue.
  const [m08, m09, m10, m11] = await Promise.all([
    readReviewQueueViaRpc('module-08'),
    readReviewQueueViaRpc('module-09'),
    readReviewQueueViaRpc('module-10'),
    readReviewQueueViaRpc('module-11'),
  ])
  const states = [
    { moduleKey: 'module-08', state: m08 },
    { moduleKey: 'module-09', state: m09 },
    { moduleKey: 'module-10', state: m10 },
    { moduleKey: 'module-11', state: m11 },
  ]

  return (
    <section aria-label={t('section')}>
      <h1 className="ppg-heading">{t('queueHeading')}</h1>
      {states.map(({ moduleKey, state }) => (
        <section key={moduleKey} aria-label={`${t('mission')}: ${moduleKey}`}>
          <h2>{moduleKey}</h2>
          {state.status === 'ok' && state.queue.length > 0 ? (
            <table>
              <thead>
                <tr>
                  <td>{t('learner')}</td>
                  <td>{t('round')}</td>
                  <td>{t('reflection')}</td>
                  <td>{t('action')}</td>
                </tr>
              </thead>
              <tbody>
                {state.queue.map((item) => (
                  <tr
                    key={`${item.learner_id}-${item.mission_id}-${item.submission_seq}`}
                    aria-label={`${t('learner')} ${item.learner_name}, ${t('round')} ${item.submission_seq}`}
                  >
                    <td>
                      {item.learner_name} ({item.student_id})
                    </td>
                    <td>{item.submission_seq}</td>
                    <td>{item.reflection}</td>
                    <td>
                      <Link
                        href={{
                          pathname: '/teacher/review/[submissionId]',
                          params: { submissionId: `${item.mission_id}/${item.submission_seq}` },
                        }}
                      >
                        {t('review')}
                      </Link>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : state.status === 'ok' ? (
            <p>{t('queueEmpty')}</p>
          ) : state.status === 'denied' ? (
            <p>{t('queueDenied')} {state.detail}</p>
          ) : state.status === 'unauthorized' ? (
            <p>{t('queueUnauthorized')} {state.detail}</p>
          ) : state.status === 'not-configured' ? (
            <p>{t('queueNotConfigured')} {state.detail}</p>
          ) : (
            <p>{t('queueError')} {state.detail}</p>
          )}
        </section>
      ))}
      {states.every(({ state }) => state.status === 'empty' || (state.status === 'ok' && state.queue.length === 0)) ? (
        <p>
          <StatusPill tone="locked" label={t('queueEmpty')} />
        </p>
      ) : null}
      <Card
        heading={t('rubricHeading')}
        body={t('states.ok')}
        status="available"
      />
    </section>
  )
}

export default function TeacherReviewPage() {
  const t = useTranslations('review')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <TeacherQueue />
    </Suspense>
  )
}
