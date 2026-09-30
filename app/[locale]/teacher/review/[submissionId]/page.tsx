import { Suspense } from 'react'

import { getTranslations } from 'next-intl/server'
import { Link } from '../../../../../lib/i18n/routing'

import { readRubricCriteriaViaRpc } from '../../../../../lib/sup/reviews'
import { Card } from '../../../../../components/Card'

/**
 * Ticket #14 teacher review form (one submission round): the 7 criterion
 * scores 1–5 each with the bilingual written descriptors (the rubric
 * taxonomy rides `ppg_read_rubric_criteria`; ADR-0003), the bilingual
 * written feedback, and the decision approved | needs_improvement. The form
 * POSTs to /api/review/submit — the SERVER validates (a 0/6/8 smuggle NEVER
 * rides — `rubric_score_denied`; the total 7–35 the SERVER computes, never a
 * client count; one row PER round — the PK denies a second INSERT). The
 * teacher/admin-only gate rides the RPC (`denied_role`), never a UI hide.
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
}: {
  submissionId: string
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
    <section aria-label={t('reviewHeading')}>
      <p>
        <Link href="/teacher/review">{t('backToQueue')}</Link>
      </p>
      <h1 className="ppg-heading">
        {t('reviewHeading')} — {moduleKey} #{submissionSeq}
      </h1>

      {criteria.status === 'ok' ? (
        <form
          data-ppg-review-form="review"
          aria-label={t('submitReview')}
          method="POST"
          action="/api/review/submit"
        >
          <input name="moduleKey" defaultValue={moduleKey} hidden={true} />
          <input name="submissionSeq" defaultValue={submissionSeq} hidden={true} />

          <fieldset>
            <legend>{t('rubricHeading')}</legend>
            {(criteria.criteria ?? []).map((criterion: RubricCriteria) => {
              const descriptors = (criteria.descriptors ?? []).filter(
                (d: RubricDescriptor) => d.criterion_key === criterion.criterion_key,
              )
              return (
                <div
                  key={criterion.criterion_key}
                  style={{ borderBottom: '1px solid var(--ppg-blue-300)', paddingBlock: 'var(--ppg-space-2)' }}
                >
                  <div style={{ fontWeight: 700 }}>{criterion.label_en}</div>
                  <div style={{ fontSize: '0.9rem' }}>
                    {descriptors
                      .slice()
                      .sort((a: RubricDescriptor, b: RubricDescriptor) => a.score_band - b.score_band)
                      .map((d: RubricDescriptor) => (
                        <div key={`${d.criterion_key}-${d.score_band}`}>
                          <strong>{d.score_band}</strong> — {d.descriptor_en} / {d.descriptor_th}
                        </div>
                      ))}
                  </div>
                  <div role="radiogroup" aria-label={criterion.label_en} style={{ display: 'flex', gap: '0.5rem' }}>
                    {[1, 2, 3, 4, 5].map((score) => (
                      <label key={score} style={{ display: 'inline-flex', alignItems: 'center', gap: '0.25rem' }}>
                        <input type="radio" name={`score_${criterion.criterion_key}`} value={score} required />
                        <span>{score}</span>
                      </label>
                    ))}
                  </div>
                </div>
              )
            })}
          </fieldset>

          <fieldset>
            <legend>{t('feedbackHeading')}</legend>
            <label htmlFor="review_feedback_th">{t('feedbackTh')}</label>
            <textarea id="review_feedback_th" name="feedbackTh" rows={4} required />
            <label htmlFor="review_feedback_en">{t('feedbackEn')}</label>
            <textarea id="review_feedback_en" name="feedbackEn" rows={4} required />
          </fieldset>

          {/* the decision: the two buttons ride `decision` — approve |
              needs_improvement (the RPC's own gate is the authority) */}
          <button type="submit" name="decision" value="approved">
            {t('approve')}
          </button>
          <button type="submit" name="decision" value="needs_improvement">
            {t('needsImprovement')}
          </button>
        </form>
      ) : criteria.status === 'unauthorized' ? (
        <p>{t('queueUnauthorized')} {criteria.detail}</p>
      ) : (
        <p>{t('queueError')} {criteria.detail}</p>
      )}

      <Card
        heading={t('rubricHeading')}
        body={t('totalScore') + ': 7–35'}
        status="available"
      />
    </section>
  )
}

export default async function TeacherReviewSubmissionPage({
  params,
}: {
  params: Promise<{ submissionId: string }>
}) {
  const t = await getTranslations('review')
  const { submissionId } = await params
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <ReviewForm submissionId={submissionId} />
    </Suspense>
  )
}
