import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../../../lib/i18n/routing'

import { readChapterTestStateViaRpc } from '../../../../../../lib/sup/chapterTest'
import { isChapterKey, isChapterTestPhase, type ChapterTestPhase } from '../../../../../../lib/chapterTest'
import { Badge } from '../../../../../../components/Badge'
import { StatusPill } from '../../../../../../components/StatusPill'

/**
 * Ticket #74: the Chapter pre-test and post-test screens. The page reads the
 * state through the session JWT — both banks (prompts + options, never the
 * answer key), the caller's own attempt scores (first = research measure,
 * best = gate) and the latest per-question feedback. A form posts to
 * `/api/chapter-test/submit`, which scores server-side and redirects back
 * here; the persisted attempt then renders the score + feedback. The pre-test
 * is one attempt (the form disappears after submit); the post-test allows
 * retries (the form stays, labelled as a retry). `force-dynamic` because the
 * reads carry the learner's JWT.
 */
export const dynamic = 'force-dynamic'

function pick(locale: string, th: string | undefined, en: string | undefined) {
  return locale === 'th' ? (th ?? en ?? '') : (en ?? th ?? '')
}

async function TestScreen({ chapterKey, phase }: { chapterKey: string; phase: ChapterTestPhase }) {
  const t = await getTranslations('chapterTest')
  const locale = await getLocale()

  if (!isChapterKey(chapterKey) || !isChapterTestPhase(phase)) {
    return (
      <section className="ppg-page-wrap">
        <p className="ppg-state-line">{t('states.invalidPhase')}</p>
        <Link className="ppg-link" href="/course">{t('linkMap')}</Link>
      </section>
    )
  }

  const state = await readChapterTestStateViaRpc(chapterKey)
  if (state.status !== 'ok') {
    const copy =
      state.status === 'denied'
        ? t('states.denied')
        : state.status === 'unauthorized'
          ? t('states.unauthorized')
          : state.status === 'not-configured'
            ? t('states.notConfigured')
            : state.status === 'empty'
              ? t('states.empty')
              : t('states.error')
    return (
      <section className="ppg-page-wrap">
        <p className="ppg-state-line">{copy} {state.detail}</p>
        <Link className="ppg-link" href="/course">{t('linkMap')}</Link>
      </section>
    )
  }

  const phaseState = phase === 'pre' ? state.pre : state.post
  const questions = phaseState?.questions ?? []
  const total = phaseState?.total ?? 0
  const attempts = phaseState?.attempts ?? 0
  const feedback = phaseState?.feedback ?? []
  const feedbackByOrder = new Map(feedback.map((f) => [f.order_index, f]))
  const submitted = attempts > 0
  const showForm = phase === 'post' || !submitted
  const passed = phase === 'post' && (phaseState?.best_score ?? 0) * 100 >= 70 * total

  return (
    <section className="ppg-page-wrap" aria-label={t('label')}>
      {/** The course/badges header pattern: left-aligned ink title, the
       * intro under it, the chapter meta aligned in the same block. */}
      <div className="ppg-gallery-head">
        <div>
          <h1 className="ppg-heading ppg-heading-text ppg-gallery-title">
            {phase === 'pre' ? t('preTitle') : t('postTitle')}
          </h1>
          <p className="ppg-card-text">{phase === 'pre' ? t('preIntro') : t('postIntro')}</p>
        </div>
        <div className="ppg-gallery-counts">
          <Badge
            text={`${pick(locale, state.title_th, state.title_en)} · ${chapterKey}`}
            tone="neutral"
          />
        </div>
      </div>

      {submitted ? (
        <div className="ppg-instr-receipt">
          <h2 className="ppg-sc-result-title">{phase === 'pre' ? t('preDone') : t('postDone')}</h2>
          <p>{t('scoreLine', { score: String(phaseState?.last_score ?? 0), total: String(total) })}</p>
          <p>{t('attempts')}: {attempts}</p>
          {phase === 'post' ? (
            <>
              <p>{t('firstScore')}: {phaseState?.first_score ?? 0} / {total}</p>
              <p>{t('bestScore')}: {phaseState?.best_score ?? 0} / {total}</p>
              <StatusPill
                tone={passed ? 'success' : 'warning'}
                label={passed ? t('passed') : t('notPassed')}
              />
            </>
          ) : null}
        </div>
      ) : null}

      {state.nextUnlocked ? <p className="ppg-state-line">{t('nextUnlocked')} ({state.nextChapterKey})</p> : null}

      {questions.length === 0 ? <p className="ppg-state-line">{t('states.empty')}</p> : null}

      {questions.length > 0 ? (
        <>
          <h2 className="ppg-list-title">{t('questionsLabel')}</h2>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 'var(--ppg-space-3)' }}>
            {questions.map((q, index) => (
              <div key={q.order_index} className="ppg-instr-item">
                <div style={{ display: 'flex', justifyContent: 'space-between', gap: 'var(--ppg-space-2)', flexWrap: 'wrap' }}>
                  <Badge text={t('questionTag', { n: String(q.order_index) })} tone="neutral" />
                  <Badge text={t('itemProgress', { n: String(index + 1), total: String(total) })} tone="neutral" />
                </div>
                <p className="ppg-sc-question">{pick(locale, q.prompt_th, q.prompt_en)}</p>
                {feedbackByOrder.has(q.order_index) ? (
                  <p className="ppg-card-text">
                    {t('yourAnswer')}: {feedbackByOrder.get(q.order_index)?.chosen || t('notAnswered')} ·{' '}
                    {feedbackByOrder.get(q.order_index)?.correct ? t('feedbackCorrect') : t('feedbackIncorrect')}
                  </p>
                ) : null}
                {showForm ? (
                  <div className="ppg-sc-options">
                    {(q.options ?? []).map((option) => (
                      <label key={option.option_key} className="ppg-instr-opt">
                        <input
                          type="radio"
                          name={`item_${q.order_index}`}
                          value={option.option_key}
                          required
                          form="chapter-test-form"
                        />
                        <span className="ppg-sc-opt-letter" aria-hidden="true">{option.option_key}</span>
                        <span className="ppg-sc-opt-text">{pick(locale, option.option_th, option.option_en)}</span>
                      </label>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </>
      ) : null}

      {feedback.length > 0 ? (
        <>
          <h2 className="ppg-list-title">{t('feedbackHeading')}</h2>
          <ul>
            {feedback.map((f) => {
              const q = questions.find((row) => row.order_index === f.order_index)
              return (
                <li key={f.order_index}>
                  {t('questionTag', { n: String(f.order_index) })}: {q ? pick(locale, q.prompt_th, q.prompt_en) : ''} —{' '}
                  {f.correct ? t('feedbackCorrect') : t('feedbackIncorrect')}
                </li>
              )
            })}
          </ul>
        </>
      ) : null}

      {showForm && questions.length > 0 ? (
        <div className="ppg-sc-panel">
          <form
            id="chapter-test-form"
            data-ppg-chapter-test={phase}
            aria-label={t('optionsLabel')}
            method="POST"
            action="/api/chapter-test/submit"
          >
            <input type="hidden" name="chapter_key" value={chapterKey} />
            <input type="hidden" name="phase" value={phase} />
            <input type="hidden" name="language" value={locale === 'th' ? 'th' : 'en'} />
            <input type="hidden" name="locale" value={locale === 'th' ? 'th' : 'en'} />
            <div className="ppg-sc-cta-row">
              <button className="ppg-button" type="submit">
                {phase === 'pre' ? t('submitPre') : attempts > 0 ? t('retry') : t('submitPost')}
              </button>
            </div>
          </form>
        </div>
      ) : null}

      <p>
        <Link
          className="ppg-link"
          href={{ pathname: '/course/[moduleKey]' as const, params: { moduleKey: chapterKey } }}
        >
          {t('backToChapter')}
        </Link>
      </p>
      <p>
        <Link className="ppg-link" href="/course">{t('linkMap')}</Link>
      </p>
    </section>
  )
}

export default async function ChapterTestPage({
  params,
}: {
  params: Promise<{ moduleKey: string; phase: string }>
}) {
  const t = await getTranslations('chapterTest')
  const { moduleKey, phase } = await params
  return (
    <Suspense fallback={<div>{t('states.error')}</div>}>
      <main>
        <TestScreen chapterKey={moduleKey} phase={phase as ChapterTestPhase} />
      </main>
    </Suspense>
  )
}
