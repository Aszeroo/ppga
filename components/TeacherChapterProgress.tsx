import { getLocale, getTranslations } from 'next-intl/server'

import { readOwnProfile } from '../lib/sup/profile'
import { readChapterProgressData } from '../lib/sup/chapterProgress'
import { buildRosterProgress, chapterStatusText } from '../lib/chapterProgress'
import { StatusPill } from './StatusPill'

/**
 * PPGA #86: the Teacher/Admin chapter-progress view. It replaces the retired
 * worksheet review queue: every learner, their nine chapters' pre/post and
 * Mission state, and the Final Test aggregate. Every row is a real read under
 * the caller's session JWT (the RLS policies give staff the cohort); there is
 * no invented score and no practical/rubric progress.
 */
export async function TeacherChapterProgress() {
  const t = await getTranslations('teacherProgress')
  const locale = await getLocale()
  const profile = await readOwnProfile()
  const role = profile.status === 'ok' ? profile.row?.role : undefined
  if (role !== 'teacher' && role !== 'admin') {
    return (
      <main>
        <section aria-label={t('title')} className="ppg-page-wrap">
          <h1 className="ppg-heading ppg-heading-text">{t('title')}</h1>
          <p className="ppg-state-line">{t('states.denied')}</p>
        </section>
      </main>
    )
  }

  const data = await readChapterProgressData({ roster: true })
  if (data.status !== 'ok') {
    return (
      <main>
        <section aria-label={t('title')} className="ppg-page-wrap">
          <h1 className="ppg-heading ppg-heading-text">{t('title')}</h1>
          <p className="ppg-state-line">{t(`states.${data.status === 'not-configured' ? 'notConfigured' : data.status}` as never)} {data.detail}</p>
        </section>
      </main>
    )
  }

  const chapters = (data.modules ?? []).map((m) => ({
    chapter_key: m.module_key,
    order_index: m.order_index,
    title_th: m.title_th,
    title_en: m.title_en,
    open: true,
  }))
  const roster = buildRosterProgress(
    data.learners ?? [],
    chapters,
    data.attempts ?? [],
    data.missions ?? [],
    data.responses ?? [],
    data.retries ?? [],
  )
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  const statusCopy = {
    pre: t('chapterStatus.pre'),
    post: t('chapterStatus.post'),
    mission: t('chapterStatus.mission'),
    missionDone: t('chapterStatus.missionDone'),
    missionPending: t('chapterStatus.missionPending'),
    notStarted: t('chapterStatus.notStarted'),
    passed: t('chapterStatus.passed'),
    notPassed: t('chapterStatus.notPassed'),
  }
  const tileState = (chapter: (typeof roster)[number]['chapters'][number]) =>
    chapter.post.passed ? 'passed' : chapter.pre.submitted ? 'in-progress' : 'not-started'

  return (
    <main>
      <section aria-label={t('title')} className="ppg-page-wrap" data-ppg-teacher-progress="true">
        <h1 className="ppg-heading ppg-heading-text">{t('title')}</h1>
        <p className="ppg-work-head-sub">{t('sub')}</p>

        {roster.length === 0 ? <p className="ppg-state-line">{t('states.empty')}</p> : null}

        {roster.length > 0 ? (
          <div className="ppg-teacher-grid">
            {roster.map((learner) => (
              <div key={learner.learner_id} className="ppg-status-card ppg-teacher-card" data-ppg-learner={learner.learner_id}>
                <h2 className="ppg-teacher-card-name">{learner.full_name}</h2>
                <p className="ppg-teacher-card-meta">{learner.student_id}</p>

                {/* The nine-chapter scan strip: the numeral + the state glyph
                 * stay visual, the full pre/post/Mission status stays in the
                 * accessible name and the disclosure rows below. */}
                <ul className="ppg-teacher-chapter-grid">
                  {learner.chapters.map((chapter) => {
                    const status = chapterStatusText(chapter, statusCopy)
                    const state = tileState(chapter)
                    return (
                      <li
                        key={chapter.chapter_key}
                        className="ppg-teacher-chapter-tile"
                        data-state={state}
                        title={status}
                      >
                        <span className="ppg-teacher-tile-number" aria-hidden="true">
                          {chapter.order_index}
                        </span>
                        <span className="ppg-teacher-tile-icon" aria-hidden="true">
                          {state === 'passed' ? '✓' : state === 'in-progress' ? '…' : '–'}
                        </span>
                        <span className="ppg-teacher-sr">
                          {chapter.order_index}. {pick(chapter.title_th, chapter.title_en)} — {status}
                        </span>
                      </li>
                    )
                  })}
                </ul>

                <p className="ppg-teacher-card-line">
                  {t('finalTest')}:{' '}
                  {learner.final_test
                    ? learner.final_test.completed
                      ? `${learner.final_test.best_score ?? '—'} · ${t('attempts')}: ${learner.final_test.attempts} · ${learner.final_test.instrument_version ?? '—'}`
                      : t('notTaken')
                    : t('notTaken')}
                </p>

                <details className="ppg-teacher-details">
                  <summary className="ppg-teacher-details-summary">
                    {t('cleared')}: {learner.cleared} / {learner.total}
                    {learner.current
                      ? ` · ${t('current')}: ${learner.current.order_index}. ${pick(learner.current.title_th, learner.current.title_en)}`
                      : ` · ${t('allCleared')}`}
                  </summary>
                  <ul className="ppg-board-list">
                    {learner.chapters.map((chapter) => (
                      <li key={chapter.chapter_key} className="ppg-board-item">
                        <span>
                          {chapter.order_index}. {pick(chapter.title_th, chapter.title_en)} —{' '}
                          {chapterStatusText(chapter, statusCopy)}
                        </span>{' '}
                        <StatusPill
                          tone={chapter.post.passed ? 'success' : chapter.open ? 'warning' : 'locked'}
                          label={
                            chapter.post.passed
                              ? t('chapterStatus.passed')
                              : chapter.pre.submitted
                                ? t('chapterStatus.inProgress')
                                : t('chapterStatus.notStarted')
                          }
                        />
                      </li>
                    ))}
                  </ul>
                </details>
              </div>
            ))}
          </div>
        ) : null}
      </section>
    </main>
  )
}
