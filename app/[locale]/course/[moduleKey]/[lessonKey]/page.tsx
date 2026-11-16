import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../../lib/i18n/routing'

import { readLessonsViaRpc } from '../../../../../lib/sup/curriculum'
import { readLessonStepsViaRpc } from '../../../../../lib/sup/lessonSteps'
import { readSelfCheckQuestionsViaRpc } from '../../../../../lib/sup/xp'
import { readChallengeReads } from '../../../../../lib/sup/challenge'
import { resolveLessonSteps } from '../../../../../lib/lessonSteps'
import { buildChallengeContext, challengeTrackSteps, ledgerEvent, ledgerEventAttr } from '../../../../../lib/challengeStages'
import { ChallengeTrack } from '../../../../../components/ChallengeTrack'
import { LessonPlayer } from '../../../../../components/LessonPlayer'
import { SelfCheckPanel } from '../../../../../components/SelfCheckPanel'

/**
 * Ticket #9 + #10 lesson view (#45 stage-4 framing, #52 V3 dressing on top;
 * #75 turns the body into a CAI player): the #16 story's WHAT / WHY / BODY /
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
  const tS = await getTranslations('selfcheck')
  const tC = await getTranslations('challenge')
  const locale: 'th' | 'en' = (await getLocale()) === 'th' ? 'th' : 'en'
  const state = await readLessonsViaRpc(moduleKey)
  const row = state.lessons?.find((l) => l.lesson_key === lessonKey)
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)

  const stepState = await readLessonStepsViaRpc(lessonKey)
  const steps = resolveLessonSteps(row, stepState.status === 'ok' ? stepState.steps ?? [] : [], locale)
  const hasStepRows = stepState.status === 'ok' && (stepState.steps?.length ?? 0) > 0

  // CAI lessons never read the Self-Check bank: mini-checks are formative and
  // the Self-Check path gates progression and awards XP.
  const questions = hasStepRows ? null : await readSelfCheckQuestionsViaRpc(lessonKey)

  const ctx = buildChallengeContext(moduleKey, await readChallengeReads(moduleKey))
  const checkEvent = ledgerEvent(ctx.own, 'self_check_pass', lessonKey)
  // the Lesson page walks the first three steps (the Result lives downstream).
  const trackSteps = challengeTrackSteps(ctx, moduleKey, {
    title: (key) => tC(`steps.${key}`),
    state: (stateNow) => tC(`states.${stateNow}`),
    current: tC('current'),
  }, { limit: 3 })
  return (
    <section aria-label={t('viewTitle')} className="ppg-page-wrap">
      <ChallengeTrack label={tC('trackLabel')} steps={trackSteps} />
      {row
        ? (
          <h1 className="ppg-heading ppg-heading-text">{pick(row.title_th, row.title_en)}</h1>
        )
        : null}
      {steps.length > 0
        ? <LessonPlayer lessonKey={lessonKey} steps={steps} locale={locale} />
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
      <p>
        <Link className="ppg-link" href={{ pathname: '/course/[moduleKey]', params: { moduleKey } }}>{t('linkModule')}</Link>
      </p>
      <p>
        <Link className="ppg-link" href="/course">{t('linkMap')}</Link>
      </p>
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
