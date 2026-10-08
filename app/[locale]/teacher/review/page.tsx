import { Suspense } from 'react'

import { useTranslations } from 'next-intl'
import { getTranslations } from 'next-intl/server'
import { Link } from '../../../../lib/i18n/routing'

import { readReviewQueueViaRpc } from '../../../../lib/sup/reviews'
import { Badge } from '../../../../components/Badge'
import { StatusPill } from '../../../../components/StatusPill'

/**
 * Ticket #14 teacher review queue, #55 V3 utilitarian dressing (presentation
 * only — the RPC reads, the mission grouping, the oldest-round order and the
 * review links are UNCHANGED): the submissions whose status rides `submitted`
 * (pending review; the learner name + the Mission + the round; the oldest
 * round first — `ppg_review_queue`) wearing the gallery's `#t-queue` frame —
 * the heading block (📥 queue title + sub), the REAL count chips (All +
 * Pending over the queue's own rows — never invented totals) and one panel
 * per module grouping the per-learner/round cards (the learner + the round
 * meta line + the warning StatusPill — state as copy + tone, never colour
 * alone — + the review action link). The teacher/admin-only gate speaks
 * server-side (a learner who reaches the pathname rides `denied`, never a
 * UI-only hide). `force-dynamic` because the queue reads through the session
 * JWT — `next build` must never pre-render someone else's queue. Every state
 * (`review.*`) has its own copy in `messages/{en,th}.json`.
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
  // the design's count chips over the REAL rows only — this queue carries the
  // `submitted` state exclusively, so All == Pending; no invented totals.
  const total = states.reduce(
    (sum, { state }) => sum + (state.status === 'ok' ? state.queue.length : 0),
    0,
  )

  return (
    <section aria-label={t('section')} className="ppg-page-wrap">
      <div className="ppg-work-head">
        <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">{t('queueTitle')}</h1>
        <p className="ppg-work-head-sub">{t('queueSub')}</p>
        {total > 0 ? (
          <div className="ppg-work-chips" role="group" aria-label={t('section')}>
            <Badge text={`${t('chipAll')} ${total}`} />
            <Badge tone="warning" text={`${t('pendingTag')} ${total}`} />
          </div>
        ) : null}
      </div>
      {states.map(({ moduleKey, state }) => (
        <section key={moduleKey} className="ppg-work-card" aria-label={`${t('mission')}: ${moduleKey}`}>
          <h2 className="ppg-list-title">
            {t('mission')} {moduleKey}
          </h2>
          {state.status === 'ok' && state.queue.length > 0 ? (
            <div className="ppg-board-list">
              {state.queue.map((item) => (
                <div
                  key={`${item.learner_id}-${item.mission_id}-${item.submission_seq}`}
                  className="ppg-queue-card"
                  role="group"
                  aria-label={`${t('learner')} ${item.learner_name}, ${t('round')} ${item.submission_seq}`}
                >
                  <div className="ppg-queue-info">
                    <b>{item.learner_name} ({item.student_id})</b>
                    <span className="ppg-queue-meta">
                      {t('mission')} {moduleKey} · {t('round')} {item.submission_seq} ·{' '}
                      {item.reflection}
                    </span>
                  </div>
                  <StatusPill tone="warning" label={t('pendingTag')} />
                  <Link
                    className="ppg-btn-secondary"
                    href={{
                      pathname: '/teacher/review/[submissionId]',
                      // PPGA #18 (production verification, finding #7): the
                      // composite id's slash must ride PERCENT-ENCODED — a
                      // raw `module-08/1` splits into two path segments and
                      // the single-segment [submissionId] route 404s (the
                      // queue's first live click was #18's journey). The
                      // detail page's decodeURIComponent handles either
                      // shape (Next may hand the param decoded already).
                      params: { submissionId: encodeURIComponent(`${item.mission_id}/${item.submission_seq}`) },
                      // PPGA #18 finding #5: (mission, round) is unique only
                      // within one learner — the queue row knows its owner, so
                      // the review screen rides the learner uuid alongside the
                      // composite id (the submit form's hidden `learnerId`).
                      query: { learner: item.learner_id },
                    }}
                  >
                    {t('review')}
                  </Link>
                </div>
              ))}
            </div>
          ) : state.status === 'ok' ? (
            <p className="ppg-state-line">{t('queueEmpty')}</p>
          ) : state.status === 'denied' ? (
            <p className="ppg-state-line">{t('queueDenied')} {state.detail}</p>
          ) : state.status === 'unauthorized' ? (
            <p className="ppg-state-line">{t('queueUnauthorized')} {state.detail}</p>
          ) : state.status === 'not-configured' ? (
            <p className="ppg-state-line">{t('queueNotConfigured')} {state.detail}</p>
          ) : (
            <p className="ppg-state-line">{t('queueError')} {state.detail}</p>
          )}
        </section>
      ))}
      {states.every(({ state }) => state.status === 'empty' || (state.status === 'ok' && state.queue.length === 0)) ? (
        <p className="ppg-state-line">
          <StatusPill tone="locked" label={t('queueEmpty')} />
        </p>
      ) : null}
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
