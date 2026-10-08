import { Suspense } from 'react'

import { getTranslations } from 'next-intl/server'
import { Link } from '../../../../../lib/i18n/routing'

import { readRubricCriteriaViaRpc } from '../../../../../lib/sup/reviews'
import { RubricRunningTotal } from '../../../../../components/RubricRunningTotal'

/**
 * Ticket #14 teacher review form (one submission round), #55 V3 utilitarian
 * dressing (presentation only — the 7 criteria 1–5 radios, the bilingual
 * feedback fields, the `decision` submit buttons and the form POST are
 * BYTE-IDENTICAL): the rubric taxonomy (ADR-0003, `ppg_read_rubric_criteria`)
 * wearing the gallery's `#t-rubric` frame — the 📋 heading, one row per
 * criterion (label + the bilingual descriptors + the 1–5 score tiles DRESS
 * the shipped radios, they never replace them), the cream/gold RUNNING TOTAL
 * out of 35 (display-only — the SERVER still computes the authoritative
 * 7–35 sum; a 0/6/8 smuggle NEVER rides, `rubric_score_denied`; one row PER
 * round — the PK denies a second INSERT), the feedback card, and the approve
 * / request-revision actions (✓/🔁 copy + icon, state never colour alone).
 * The teacher/admin-only gate rides the RPC (`denied_role`), never a UI hide.
 */
export const dynamic = 'force-dynamic'

interface RubricCriteria {
  criterion_key: string
  ordinal: number
  label_th: string
  label_en: string
}

interface RubricDescriptor {
  criterion_key: string
  score_band: number
  descriptor_th: string
  descriptor_en: string
}

async function ReviewForm({
  submissionId,
  learnerId,
}: {
  submissionId: string
  learnerId?: string
}) {
  const t = await getTranslations('review')

  // `submissionId` rides `module-08/2` (mission/round; the queue's link form).
  // The segment arrives PERCENT-ENCODED (`module-08%2F2` — the link encodes
  // the slash; the router NEVER hands a decoded `%2F`), so the DECODE rides
  // first; a raw two-segment URL can never reach this page at all.
  const raw = decodeURIComponent(submissionId)
  const slash = raw.indexOf('/')
  const moduleKey = slash === -1 ? raw : raw.slice(0, slash)
  const submissionSeq = slash === -1 ? Number.NaN : Number(raw.slice(slash + 1))

  const criteria = await readRubricCriteriaViaRpc()

  return (
    <section aria-label={t('reviewHeading')} className="ppg-page-wrap">
      <p>
        <Link className="ppg-link" href="/teacher/review">
          {t('backToQueue')}
        </Link>
      </p>
      <div className="ppg-work-head">
        <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">
          {t('rubricTitle')} — {moduleKey} #{submissionSeq}
        </h1>
        <p className="ppg-work-head-sub">{t('rubricHeading')}</p>
      </div>

      {criteria.status === 'ok' ? (
        <form
          data-ppg-review-form="review"
          aria-label={t('submitReview')}
          method="POST"
          action="/api/review/submit"
        >
          <input name="moduleKey" defaultValue={moduleKey} hidden={true} />
          <input name="submissionSeq" defaultValue={submissionSeq} hidden={true} />
          {learnerId ? <input name="learnerId" defaultValue={learnerId} hidden={true} /> : null}

          <div className="ppg-work-card">
            <fieldset className="ppg-work-form">
              <legend className="ppg-list-title">{t('rubricHeading')}</legend>
              {(criteria.criteria ?? []).map((criterion: RubricCriteria) => {
                const descriptors = (criteria.descriptors ?? []).filter(
                  (d: RubricDescriptor) => d.criterion_key === criterion.criterion_key,
                )
                return (
                  <div
                    key={criterion.criterion_key}
                    className="ppg-rubric-crit"
                  >
                    <div className="ppg-rubric-crit-label">
                      <span>{criterion.ordinal}. {criterion.label_en}</span>
                      <span>1–5</span>
                    </div>
                    <ul className="ppg-rubric-descriptors">
                      {descriptors
                        .slice()
                        .sort((a: RubricDescriptor, b: RubricDescriptor) => a.score_band - b.score_band)
                        .map((d: RubricDescriptor) => (
                          <li key={`${d.criterion_key}-${d.score_band}`}>
                            <strong>{d.score_band}</strong> — {d.descriptor_en} / {d.descriptor_th}
                          </li>
                        ))}
                    </ul>
                    <div role="radiogroup" aria-label={criterion.label_en} className="ppg-rubric-scores">
                      {[1, 2, 3, 4, 5].map((score) => (
                        <label key={score} className="ppg-rubric-score">
                          <input type="radio" name={`score_${criterion.criterion_key}`} value={score} required />
                          <span>{score}</span>
                        </label>
                      ))}
                    </div>
                  </div>
                )
              })}
              {/* display-only running total — the server still recomputes 7–35 */}
              <RubricRunningTotal />
            </fieldset>
          </div>

          <div className="ppg-work-card">
            <fieldset className="ppg-work-form">
              <legend className="ppg-list-title">{t('feedbackHeading')}</legend>
              <label className="ppg-field-label" htmlFor="review_feedback_th">{t('feedbackTh')}</label>
              <textarea className="ppg-input" id="review_feedback_th" name="feedbackTh" rows={4} required placeholder={t('feedbackPlaceholder')} />
              <label className="ppg-field-label" htmlFor="review_feedback_en">{t('feedbackEn')}</label>
              <textarea className="ppg-input" id="review_feedback_en" name="feedbackEn" rows={4} required placeholder={t('feedbackPlaceholder')} />
            </fieldset>
          </div>

          {/* the decision: the two buttons ride `decision` — approve |
              needs_improvement (the RPC's own gate is the authority) */}
          <div className="ppg-work-chips">
            <button type="submit" name="decision" value="approved" className="ppg-cta">
              {t('approvePass')}
            </button>
            <button type="submit" name="decision" value="needs_improvement" className="ppg-btn-secondary">
              {t('requestRevision')}
            </button>
          </div>
        </form>
      ) : criteria.status === 'unauthorized' ? (
        <p className="ppg-state-line">{t('queueUnauthorized')} {criteria.detail}</p>
      ) : (
        <p className="ppg-state-line">{t('queueError')} {criteria.detail}</p>
      )}
    </section>
  )
}

export default async function TeacherReviewSubmissionPage({
  params,
  searchParams,
}: {
  params: Promise<{ submissionId: string }>
  searchParams: Promise<{ learner?: string | string[] }>
}) {
  const t = await getTranslations('review')
  const { submissionId } = await params
  // PPGA #18 finding #5: the queue's link carries the row's owner — the
  // review must name the learner (the (mission, round) pair alone is not a
  // submission identity across learners).
  const learnerParam = (await searchParams).learner
  const learnerId = typeof learnerParam === 'string' ? learnerParam : undefined
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <ReviewForm submissionId={submissionId} learnerId={learnerId} />
    </Suspense>
  )
}
