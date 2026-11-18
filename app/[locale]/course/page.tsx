import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../lib/i18n/routing'

import { readCourseMapViaRpc, readOwnCompletedModuleKeysViaTable } from '../../../lib/sup/curriculum'
import { readChapterProgressData } from '../../../lib/sup/chapterProgress'
import { readFinalTestState } from '../../../lib/sup/posttest'
import { buildChapterProgress, chapterStatusText } from '../../../lib/chapterProgress'
import { buildStageMapView, type Stage } from '../../../lib/courseStages'
import { ProgressBar } from '../../../components/ProgressBar'
import { StageMap } from '../../../components/StageMap'
import { type StageNodeProps } from '../../../components/StageNode'

/**
 * Ticket #44 (#41 stage 3) Course Map as a STAGE MAP: the 11 Modules as an
 * ordered pixel road inside the Shell — every stage carries its real
 * `cleared | open | locked` state read SERVER-SIDE (`ppg_course_map` speaks
 * the linear rule's open/locked; the learner's OWN `complete` Mission rows —
 * the same authority the rule reads — speak cleared; the merge is the pure
 * `lib/courseStages.ts`). Locked stages are visible AND semantically locked
 * (stripes + copy + `aria-disabled`, never a colour-only cue, never hidden,
 * never fake-unlocked); the map always names the real next stage (the first
 * OPEN node + the continue band). No rule, no schema: the DATABASE's own
 * unlock state is the whole story. `force-dynamic` because the reads carry
 * the session JWT — `next build` must never pre-render someone else's map.
 */
export const dynamic = 'force-dynamic'

async function CourseStageMap() {
  const t = await getTranslations('course')
  const locale = await getLocale()
  const [map, completed, chapterData, finalTest] = await Promise.all([
    readCourseMapViaRpc(),
    readOwnCompletedModuleKeysViaTable(),
    readChapterProgressData(),
    readFinalTestState(),
  ])
  const chapters = buildChapterProgress(
    completed.uid ?? chapterData.uid ?? '',
    (map.modules ?? []).map((m) => ({
      chapter_key: m.module_key,
      order_index: m.order_index,
      title_th: m.title_th,
      title_en: m.title_en,
      open: m.lock_state === 'open',
    })),
    chapterData.status === 'ok' ? chapterData.attempts ?? [] : [],
    chapterData.status === 'ok' ? chapterData.missions ?? [] : [],
  )
  const view = buildStageMapView(map, completed, chapters)
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  const stateCopy = (state: Stage['state']) =>
    state === 'cleared' ? t('states.cleared') : state === 'open' ? t('states.open') : t('states.locked')
  const statusCopy = (progress: NonNullable<Stage['progress']>) =>
    chapterStatusText(progress, {
      pre: t('chapterStatus.pre'),
      post: t('chapterStatus.post'),
      mission: t('chapterStatus.mission'),
      missionDone: t('chapterStatus.missionDone'),
      missionPending: t('chapterStatus.missionPending'),
      notStarted: t('chapterStatus.notStarted'),
      passed: t('chapterStatus.passed'),
      notPassed: t('chapterStatus.notPassed'),
    })

  const nodes: StageNodeProps[] = view.stages.map((stage) => ({
    moduleKey: stage.module_key,
    orderIndex: stage.order_index,
    title: pick(stage.title_th, stage.title_en),
    summary: pick(stage.summary_th, stage.summary_en),
    // The pre/post/mission status rides its OWN unclamped line so the card
    // never ellipsises "Mission: …" off the end of a clamped description.
    progressText: stage.progress ? statusCopy(stage.progress) : undefined,
    state: stage.state,
    stateCopy: stateCopy(stage.state),
    isNext: view.next?.module_key === stage.module_key,
    nextCopy: t('currentStage'),
    // A locked stage gets NO route: visibly and semantically locked, it is
    // never a link that would fake-unlock it.
    href:
      stage.state === 'locked'
        ? undefined
        : { pathname: '/course/[moduleKey]' as const, params: { moduleKey: stage.module_key } },
  }))

  return (
    <section aria-label={t('mapLabel')} className="ppg-page-wrap">
      {view.status === 'ok' ? (
        <>
          {/** PPGA #52: the gallery's `#s-map` composition — the centered
           * pixel title, the cleared-stages card, the continue band riding
           * the ONE `.ppg-cta` face of this context, and the 760px stage
           * road with the ↓ connectors + glow on the current stage (all in
           * `app/globals.css` — the components carry the semantics only). */}
          <div className="ppg-map-head">
            <h1 className="ppg-heading ppg-heading-text ppg-map-title">{t('title')}</h1>
            <div className="ppg-map-progress">
              <p className="ppg-card-text">
                {t('progressCleared')}{' '}
                <span className="ppg-xp-numeral">
                  {view.cleared} / {view.total}
                </span>
              </p>
              <ProgressBar value={view.cleared} max={view.total} label={t('progressCleared')} />
            </div>
          </div>
          {view.next ? (
            <p className="ppg-stage-direction" data-ppg-stage-direction="next">
              {t('continueStage')}{' '}
              <Link
                href={{
                  pathname: '/course/[moduleKey]' as const,
                  params: { moduleKey: view.next.module_key },
                }}
                className="ppg-cta"
              >
                {String(view.next.order_index).padStart(2, '0')}. {pick(view.next.title_th, view.next.title_en)}
              </Link>
            </p>
          ) : null}
          <StageMap stages={nodes} mapLabel={t('mapLabel')} />
          <section className="ppg-work-card" data-ppg-final-test-state={finalTest ? 'present' : 'absent'}>
            <h2 className="ppg-list-title">{t('finalTest.title')}</h2>
            {finalTest ? (
              <>
                <p className="ppg-card-text">
                  {finalTest.completed ? t('finalTest.completed') : t('finalTest.notTaken')}
                </p>
                {finalTest.completed ? (
                  <>
                    <p className="ppg-card-text">
                      {t('finalTest.firstScore')}: {finalTest.first_score ?? '—'} ·{' '}
                      {t('finalTest.bestScore')}: {finalTest.best_score ?? '—'} ·{' '}
                      {t('finalTest.attempts')}: {finalTest.attempts}
                    </p>
                    <p className="ppg-card-text">
                      {t('finalTest.instrumentVersion')}: {finalTest.instrument_version ?? '—'}
                    </p>
                  </>
                ) : null}
              </>
            ) : (
              <p className="ppg-card-text">{t('finalTest.unavailable')}</p>
            )}
          </section>
        </>
      ) : null}
      {chapterData.status !== 'ok' && view.status === 'ok' ? (
        <p className="ppg-state-line">{t('chapterStatus.unavailable')} {chapterData.detail}</p>
      ) : null}
      {view.status === 'empty' ? <p>{t('states.empty')} {view.detail}</p> : null}
      {view.status === 'error' ? <p>{t('states.error')} {view.detail}</p> : null}
      {view.status === 'denied' ? <p>{t('states.denied')} {view.detail}</p> : null}
      {view.status === 'unauthorized' ? <p>{t('states.unauthorized')} {view.detail}</p> : null}
      {view.status === 'not-configured' ? <p>{t('states.notConfigured')} {view.detail}</p> : null}
    </section>
  )
}

export default async function CoursePage() {
  const t = await getTranslations('course')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <main>
        <CourseStageMap />
      </main>
    </Suspense>
  )
}
