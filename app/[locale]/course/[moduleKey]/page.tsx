import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../lib/i18n/routing'

import { readLessonsViaRpc } from '../../../../lib/sup/curriculum'
import { readChapterTestStateViaRpc } from '../../../../lib/sup/chapterTest'
import { isChapterKey } from '../../../../lib/chapterTest'
import { readChallengeReads } from '../../../../lib/sup/challenge'
import { buildChallengeContext, buildUnlockBand, challengeCopyFrom, challengeTrackSteps, rewardChipProps } from '../../../../lib/challengeStages'
import { Card } from '../../../../components/Card'
import { ChallengeTrack } from '../../../../components/ChallengeTrack'
import { XpRewardChip } from '../../../../components/XpRewardChip'

/**
 * Ticket #9 module detail (#45 stage-4 framing on top): the Lessons an OPEN
 * module shows (the `ppg_module_lessons` RPC — published + the gate + the
 * module OPEN for a learner; a locked module returns `[]` server-side so the
 * page shows the locked state text, the lesson rows are INACCESSIBLE
 * server-side, never a hidden UI). The #45 framing adds ONLY presentation on
 * the stage-map vocabulary: the module's Lesson → Self-Check → Mission →
 * Result CHALLENGE TRACK (states from the real reads — checks cleared by the
 * learner's OWN ledger events, the Mission locked/open per the SERVER's own
 * availability read, cleared by the OWN `complete` row), the unlock band
 * ONLY when the learner's own completion actually opened the next module,
 * the REAL reward chip once its ledger row exists, and the Mission link that
 * always points at the Knowledge Mission (PPGA #85 retired the practical
 * worksheet/upload destination).
 * `force-dynamic` because the page reads the detail through the session JWT.
 * Every state (`lesson.list`, `lesson.states.*`, `lesson.linkMap`,
 * `lesson.fallbackSuspense`, `challenge.*`) has its own copy in `messages`.
 *
 * The #52 V3 dressing (presentation only): the page wraps in the gallery's
 * `.ppg-page-wrap` column, the challenge road (the module's at-a-glance
 * progress) rides the CSS-driven `.ppg-stage-map` + the V3 node surfaces the
 * shared `stageNodeStyle` already carries (no second gradient authored —
 * the locked step KEEPS its stripes), the lesson rows sit in the hub's
 * auto-fit grid under a visible section title, the unlock band rides the
 * strip card, and the in-content links wear the `.ppg-link` text face — the
 * page carries no CTA face at all, so nothing competes for primary.
 */
export const dynamic = 'force-dynamic'

async function LessonsList({ moduleKey }: { moduleKey: string }) {
  const t = await getTranslations('lesson')
  const tC = await getTranslations('challenge')
  const locale = await getLocale()
  const state = await readLessonsViaRpc(moduleKey)
  const ctx = buildChallengeContext(moduleKey, await readChallengeReads(moduleKey))
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  const copy = challengeCopyFrom(tC)
  const trackSteps = challengeTrackSteps(ctx, moduleKey, copy)
  const unlocked = buildUnlockBand(ctx, tC('unlockNext'), locale)
  const reward = rewardChipProps(ctx, tC('rewardNote'))
  return (
    <section aria-label={t('list')} className="ppg-page-wrap">
      {/* The challenge road IS the module's at-a-glance progress: the stage
          vocabulary (#44, V3-dressed by #52) reads cleared / current / locked
          from the learner's own reads, copy + icon + stripes — never hue. */}
      <ChallengeTrack label={tC('trackLabel')} steps={trackSteps} />
      {reward
        ? (
          <p>
            <XpRewardChip {...reward} />
          </p>
        )
        : null}
      {unlocked
        ? (
          // The unlock band rides the hub's strip card (the gallery's
          // celebration card) with the text link face — the page keeps NO
          // second CTA face to compete with it.
          <p className="ppg-status-card ppg-strip-top" data-ppg-unlock="next-module">
            {unlocked.copy}{' '}
            <Link href={unlocked.href} className="ppg-link">
              {unlocked.title}
            </Link>
          </p>
        )
        : null}
      <h2 className="ppg-list-title">{t('list')}</h2>
      {state.status === 'ok' && state.lessons && state.lessons.length > 0
        ? (
          <div className="ppg-hub-grid">
            {state.lessons
              .sort((a, b) => a.order_index - b.order_index)
              .map((row) => (
                <Card
                  key={row.lesson_key}
                  heading={`${row.order_index}. ${pick(row.title_th, row.title_en)}`}
                  body={pick(row.what_learn_th, row.what_learn_en)}
                  status="available"
                />
              ))}
          </div>
        )
        : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      {ctx.steps.find((s) => s.key === 'mission')?.state !== 'locked'
        ? (
          <p>
            <Link
              className="ppg-link"
              href={{ pathname: '/course/[moduleKey]/mission', params: { moduleKey } }}
            >
              {t('linkMission')}
            </Link>
          </p>
        )
        : null}
      <p>
        <Link className="ppg-link" href="/course">{t('linkMap')}</Link>
      </p>
    </section>
  )
}

async function ChapterOverview({ chapterKey }: { chapterKey: string }) {
  const t = await getTranslations('chapterTest')
  const tL = await getTranslations('lesson')
  const locale = await getLocale()
  const state = await readChapterTestStateViaRpc(chapterKey)
  // #75: the Chapter's CAI lessons are reachable from the overview. The same
  // server-side visibility rule decides the rows (a locked chapter returns
  // `[]`, never a hidden link).
  const lessons = await readLessonsViaRpc(chapterKey)
  const pickText = (th: string | undefined, en: string | undefined) =>
    locale === 'th' ? (th ?? en ?? '') : (en ?? th ?? '')
  const preAttempts = state.pre?.attempts ?? 0
  const postAttempts = state.post?.attempts ?? 0
  return (
    <section aria-label={t('label')} className="ppg-page-wrap">
      <header className="ppg-chapter-head">
        <h1 className="ppg-heading ppg-heading-text">
          {state.status === 'ok' ? pickText(state.title_th, state.title_en) : t('overviewTitle')}
        </h1>
        <p className="ppg-card-text ppg-chapter-intro">{t('overviewIntro')}</p>
      </header>
      {lessons.status === 'ok' && lessons.lessons && lessons.lessons.length > 0
        ? (
          <section className="ppg-chapter-lessons" aria-labelledby="ppg-chapter-lessons-title">
            <h2 id="ppg-chapter-lessons-title" className="ppg-list-title">{tL('list')}</h2>
            <ul className="ppg-lesson-card-grid">
              {lessons.lessons
                .slice()
                .sort((a, b) => a.order_index - b.order_index)
                .map((lesson) => (
                  <li className="ppg-lesson-card-item" key={lesson.lesson_key}>
                    <article className="ppg-lesson-card" data-ppg-lesson-card={lesson.lesson_key}>
                      <span className="ppg-lesson-card-numeral" aria-hidden="true">
                        {String(lesson.order_index).padStart(2, '0')}
                      </span>
                      <div className="ppg-lesson-card-main">
                        <h3 className="ppg-lesson-card-title">
                          <Link
                            className="ppg-lesson-card-link"
                            href={{
                              pathname: '/course/[moduleKey]/[lessonKey]',
                              params: { moduleKey: chapterKey, lessonKey: lesson.lesson_key },
                            }}
                          >
                            {pickText(lesson.title_th, lesson.title_en)}
                          </Link>
                        </h3>
                        <p className="ppg-lesson-card-summary">
                          {pickText(lesson.what_learn_th, lesson.what_learn_en)}
                        </p>
                      </div>
                      <span className="ppg-lesson-card-arrow" aria-hidden="true">→</span>
                    </article>
                  </li>
                ))}
            </ul>
          </section>
        )
        : null}
      {state.status === 'ok' ? (
        <section className="ppg-chapter-tests" aria-label={t('label')}>
          <article className="ppg-chapter-test-card" data-ppg-chapter-test="pre">
            <div className="ppg-chapter-test-head">
              <h2 className="ppg-chapter-test-title">{t('preTitle')}</h2>
              <span className="ppg-chapter-test-status">
                {preAttempts > 0 ? t('preDone') : t('notStarted')}
              </span>
            </div>
            <dl className="ppg-chapter-test-metrics">
              <div>
                <dt>{t('attempts')}</dt>
                <dd>{preAttempts}</dd>
              </div>
              <div>
                <dt>{t('bestScore')}</dt>
                <dd>{state.pre?.best_score ?? 0} / {state.pre?.total ?? 0}</dd>
              </div>
            </dl>
            <Link
              className="ppg-chapter-test-action"
              href={{ pathname: '/course/[moduleKey]/chapter-test/[phase]' as const, params: { moduleKey: chapterKey, phase: 'pre' } }}
            >
              {t('openPre')} <span aria-hidden="true">→</span>
            </Link>
          </article>
          <article className="ppg-chapter-test-card" data-ppg-chapter-test="post">
            <div className="ppg-chapter-test-head">
              <h2 className="ppg-chapter-test-title">{t('postTitle')}</h2>
              <span className="ppg-chapter-test-status">
                {postAttempts > 0 ? t('postDone') : t('notStarted')}
              </span>
            </div>
            <dl className="ppg-chapter-test-metrics">
              <div>
                <dt>{t('attempts')}</dt>
                <dd>{postAttempts}</dd>
              </div>
              <div>
                <dt>{t('firstScore')}</dt>
                <dd>{state.post?.first_score ?? 0} / {state.post?.total ?? 0}</dd>
              </div>
              <div>
                <dt>{t('bestScore')}</dt>
                <dd>{state.post?.best_score ?? 0} / {state.post?.total ?? 0}</dd>
              </div>
            </dl>
            <Link
              className="ppg-chapter-test-action"
              href={{ pathname: '/course/[moduleKey]/chapter-test/[phase]' as const, params: { moduleKey: chapterKey, phase: 'post' } }}
            >
              {t('openPost')} <span aria-hidden="true">→</span>
            </Link>
          </article>
        </section>
      ) : null}
      <footer className="ppg-lesson-footer">
        <Link className="ppg-link" href="/course">{t('linkMap')}</Link>
      </footer>
    </section>
  )
}

export default async function ModulePage({ params }: { params: Promise<{ moduleKey: string }> }) {
  const t = await getTranslations('lesson')
  const { moduleKey } = await params
  if (isChapterKey(moduleKey)) {
    return (
      <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
        <ChapterOverview chapterKey={moduleKey} />
      </Suspense>
    )
  }
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <LessonsList moduleKey={moduleKey} />
    </Suspense>
  )
}
