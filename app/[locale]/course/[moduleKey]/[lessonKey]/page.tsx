import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../../lib/i18n/routing'

import { readLessonsViaRpc } from '../../../../../lib/sup/curriculum'
import { readLessonStepsViaRpc } from '../../../../../lib/sup/lessonSteps'
import { readSelfCheckQuestionsViaRpc } from '../../../../../lib/sup/xp'
import { readOwnProfile } from '../../../../../lib/sup/profile'
import { readOwnLessonReadAward } from '../../../../../lib/sup/lessonRead'
import { readChallengeReads } from '../../../../../lib/sup/challenge'
import { readChapterTestStateViaRpc } from '../../../../../lib/sup/chapterTest'
import { readLessonSlidesViaTable } from '../../../../../lib/sup/slides'
import { resolveLessonSteps } from '../../../../../lib/lessonSteps'
import { buildChallengeContext, ledgerEvent, ledgerEventAttr } from '../../../../../lib/challengeStages'
import { LessonPlayer } from '../../../../../components/LessonPlayer'
import { SelfCheckPanel } from '../../../../../components/SelfCheckPanel'

/**
 * Ticket #9 + #10 lesson view (#52 V3 dressing; #75 turns the body into a
 * CAI player; the guided-reader redesign adds the compact breadcrumb header
 * and moves the challenge track to the module page): the #16 story's WHAT / WHY / BODY /
 * WHAT-NEXT structure still comes from the DATABASE's own bilingual columns
 * (the `ppg_module_lessons` RPC filtered to the CALLER's lesson; a locked
 * module returns `[]` server-side so the page shows the unavailable state
 * text).
 *
 * #75 adds the ordered step model. The page reads `ppg_lesson_steps`
 * (objective -> explanation -> example -> check -> summary; the RPC projects
 * prompts + options only — the answer key and the pre-answer explanation
 * stay server-side) and renders the `LessonPlayer` with the localized,
 * client-safe steps. The player is a Client Component but its first step and
 * its "read all steps" fallback are server-rendered, so a no-JavaScript
 * reader still gets the lesson text.
 *
 * Legacy lessons (no step rows) go through the adapter in `lib/lessonSteps`:
 * what_learn -> objective, why + body -> explanation, what_next -> summary.
 * Those lessons keep the shipped Self-Check panel; CAI lessons do not read
 * it at all, because a mini-check is formative and must never touch the
 * Self-Check submit path (which gates and awards XP).
 *
 * The #10 Self-Check that ENDS a LEGACY lesson still runs through the
 * database's own answer-key sum (`ppg_check_self_check`) with unlimited
 * retries and the exactly-once +50/First Steps grants. The outcome card is
 * driven by the learner's REAL `self_check_pass` ledger row, never a
 * pre-pass claim. `force-dynamic` because the page reads through the session
 * JWT. Every state (`lesson.view.*`, `lesson.states.*`, `lesson.linkModule`,
 * `lesson.linkMap`, `lesson.fallbackSuspense`, `selfcheck.*`,
 * `lessonPlayer.*`, `challenge.*`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

// fallow-ignore-next-line complexity
async function LessonView({ moduleKey, lessonKey }: { moduleKey: string; lessonKey: string }) {
  const t = await getTranslations('lesson')
  const tNav = await getTranslations('nav')
  const tS = await getTranslations('selfcheck')
  const tC = await getTranslations('challenge')
  const tSlides = await getTranslations('slides')
  const locale: 'th' | 'en' = (await getLocale()) === 'th' ? 'th' : 'en'
  const [state, chapter, slides] = await Promise.all([
    readLessonsViaRpc(moduleKey),
    readChapterTestStateViaRpc(moduleKey),
    readLessonSlidesViaTable(moduleKey),
  ])
  const row = state.lessons?.find((l) => l.lesson_key === lessonKey)
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  const chapterTitle = chapter.status === 'ok'
    ? pick(chapter.title_th ?? moduleKey, chapter.title_en ?? moduleKey)
    : moduleKey
  const lessonCount = state.lessons?.length ?? 0

  const stepState = await readLessonStepsViaRpc(lessonKey)
  const steps = resolveLessonSteps(row, stepState.status === 'ok' ? stepState.steps ?? [] : [], locale)
  const hasStepRows = stepState.status === 'ok' && (stepState.steps?.length ?? 0) > 0

  // CAI lessons never read the Self-Check bank: mini-checks are formative and
  // the Self-Check path gates progression and awards XP.
  const questions = hasStepRows ? null : await readSelfCheckQuestionsViaRpc(lessonKey)

  const ctx = buildChallengeContext(moduleKey, await readChallengeReads(moduleKey))
  const checkEvent = ledgerEvent(ctx.own, 'self_check_pass', lessonKey)

  // PPGA #141: only a learner may claim the once-per-lesson +20. The server
  // reads the caller's OWN ledger row so a revisit shows "already claimed"
  // without a click; nothing is awarded on render.
  const profile = await readOwnProfile()
  const claimable = profile.status === 'ok' && profile.row?.role === 'learner'
  const readAwarded = claimable ? await readOwnLessonReadAward(lessonKey) : false
  return (
    <section aria-label={t('viewTitle')} className="ppg-page-wrap">
      {row
        ? (
          <header className="ppg-lesson-head">
            <nav className="ppg-lesson-breadcrumb" aria-label={t('viewTitle')}>
              <Link className="ppg-lesson-breadcrumb-link" href="/course">{tNav('course')}</Link>
              <span className="ppg-lesson-breadcrumb-sep" aria-hidden="true">/</span>
              <Link
                className="ppg-lesson-breadcrumb-link"
                href={{ pathname: '/course/[moduleKey]', params: { moduleKey } }}
              >
                {chapterTitle}
              </Link>
              <span className="ppg-lesson-breadcrumb-sep" aria-hidden="true">/</span>
              <span className="ppg-lesson-breadcrumb-current" aria-current="page">
                {pick(row.title_th, row.title_en)}
              </span>
            </nav>
            <h1 className="ppg-heading ppg-heading-text ppg-lesson-title">
              {pick(row.title_th, row.title_en)}
            </h1>
            <p className="ppg-lesson-meta">
              {t('lessonOf', { current: row.order_index, total: lessonCount })}
            </p>
          </header>
        )
        : null}
      {steps.length > 0
        ? <LessonPlayer lessonKey={lessonKey} steps={steps} locale={locale} readAwarded={readAwarded} claimable={claimable} />
        : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}

      {questions && questions.status === 'ok' && questions.questions ? (
        <SelfCheckPanel
          lessonKey={lessonKey}
          rows={questions.questions.map((q) => ({
            orderIndex: q.order_index,
            optionKey: q.option_key,
            stem: pick(q.prompt_th, q.prompt_en),
            option: pick(q.option_th, q.option_en),
          }))}
          sectionLabel={tS('section')}
          submitLabel={tS('submitLabel')}
          // The REAL ledger row decides the outcome card: no `self_check_pass`
          // row, no correct card — the retry card frames every other state.
          outcome={checkEvent ? 'correct' : 'retry'}
          outcomeCopy={tS('passState')}
          retryCopy={tS('retryHint')}
          reward={checkEvent
            ? {
              amount: checkEvent.amount,
              eventAttr: ledgerEventAttr(checkEvent),
              label: tC('rewardNote'),
            }
            : null}
          badgeNote={tS('badgeNote')}
        />
      ) : null}
      {questions && questions.status === 'empty' ? <p>{tS('states.empty')} {questions.detail}</p> : null}
      {questions && questions.status === 'error' ? <p>{tS('states.error')} {questions.detail}</p> : null}
      {questions && questions.status === 'denied' ? <p>{tS('states.denied')} {questions.detail}</p> : null}
      {questions && questions.status === 'unauthorized' ? <p>{tS('states.unauthorized')} {questions.detail}</p> : null}
      {questions && questions.status === 'not-configured' ? <p>{tS('states.notConfigured')} {questions.detail}</p> : null}
      <div className="ppg-lesson-footer">
        {slides.status === 'ok' && slides.slides && slides.slides.length > 0
          ? (
            <a className="ppg-link" href={`/${locale}/course/${moduleKey}#slides`}>
              {tSlides('lessonLink')}
            </a>
          )
          : null}
        <Link className="ppg-link" href={{ pathname: '/course/[moduleKey]', params: { moduleKey } }}>{t('linkModule')}</Link>
        <Link className="ppg-link" href="/course">{t('linkMap')}</Link>
      </div>
    </section>
  )
}

export default async function LessonPage({ params }: { params: Promise<{ moduleKey: string; lessonKey: string }> }) {
  const t = await getTranslations('lesson')
  const { moduleKey, lessonKey } = await params
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <LessonView moduleKey={moduleKey} lessonKey={lessonKey} />
    </Suspense>
  )
}
