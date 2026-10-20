import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../../lib/i18n/routing'

import { readLessonsViaRpc } from '../../../../../lib/sup/curriculum'
import { readSelfCheckQuestionsViaRpc } from '../../../../../lib/sup/xp'
import { readChallengeReads } from '../../../../../lib/sup/challenge'
import { buildChallengeContext, challengeTrackSteps, ledgerEvent, ledgerEventAttr } from '../../../../../lib/challengeStages'
import { Card } from '../../../../../components/Card'
import { ChallengeTrack } from '../../../../../components/ChallengeTrack'
import { SelfCheckPanel } from '../../../../../components/SelfCheckPanel'

/**
 * Ticket #9 + #10 lesson view (#45 stage-4 framing on top): the #16 story's
 * WHAT / WHY / BODY / WHAT-NEXT structure from the DATABASE's own bilingual
 * columns (the `ppg_module_lessons` RPC filtered to the CALLER's lesson; a
 * locked module returns `[]` server-side so the page shows the unavailable
 * state text), and the #10 Self-Check that ENDS the Lesson: the DATABASE's
 * own questions the SEE-ABLE Lesson shows (the `ppg_self_check_questions`
 * RPC — the answer key NEVER lands in the jsonb; a locked/draft/arched
 * Lesson returns `[]`, never a hidden UI), the retry form (the native POST
 * to /api/self-check/submit runs the `ppg_check_self_check` RPC — the
 * DATABASE's own answer-key sum decides pass/fail server-side; unlimited
 * retries), and the +50/First Steps notes the ledger/badge PKs speak
 * (exactly-once grants). The #45 framing adds ONLY presentation on the
 * stage-map vocabulary: a Lesson → Self-Check → Mission CHALLENGE TRACK
 * whose states the real reads speak, and the XP reward note swapping to the
 * REAL ledger row (the caller's own `self_check_pass` event — amount and
 * all) once the check has actually passed; pre-pass the shipped rule note
 * stays (nothing claims a grant that has not landed, nothing renders twice
 * after it has). `force-dynamic` because the page reads through the session
 * JWT. Every state (`lesson.view.*`, `lesson.states.*`, `lesson.linkModule`,
 * `lesson.linkMap`, `lesson.fallbackSuspense`, `selfcheck.section.*`,
 * `selfcheck.states.*`, `challenge.*`) has its own copy in `messages`.
 *
 * The #52 V3 dressing (presentation only — routes, form fields, server
 * reads and the native POST are UNCHANGED): the page wraps in the gallery's
 * `.ppg-page-wrap` column, the four reader cards ride the hub's auto-fit
 * grid, and the Self-Check becomes the `SelfCheckPanel` primitive in the
 * gallery's `#s-check` option vocabulary (lettered option rows; the SELECTED
 * state is the native radio's own `:checked` painted by CSS — no JS). The
 * outcome is the gallery's whole-panel card (the answer key never reaches
 * the browser, so no per-option mark could be real data): the mint
 * CORRECT card only over the learner's REAL `self_check_pass` ledger row,
 * otherwise the encouraging PINK retry card ("retry freely — no grade is
 * ever recorded"), never punitive. The pre-pass success pill is gone with
 * it: its copy read like a grant, which the shipped honesty rule (nothing
 * claims a grant that has not landed) says it never was.
 */
export const dynamic = 'force-dynamic'

// fallow-ignore-next-line complexity
async function LessonView({ moduleKey, lessonKey }: { moduleKey: string; lessonKey: string }) {
  const t = await getTranslations('lesson')
  const tS = await getTranslations('selfcheck')
  const tC = await getTranslations('challenge')
  const locale = await getLocale()
  const state = await readLessonsViaRpc(moduleKey)
  const row = state.lessons?.find((l) => l.lesson_key === lessonKey)
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  const questions = await readSelfCheckQuestionsViaRpc(lessonKey)
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
          // The WHAT/WHY/BODY/WHAT-NEXT cards ride the hub's auto-fit grid
          // (the gallery's `g2` reader row: two columns wide, one on phone).
          <div className="ppg-hub-grid">
            <Card heading={t('whatHeading')} body={pick(row.what_learn_th, row.what_learn_en)} status="available" />
            <Card heading={t('whyHeading')} body={pick(row.why_th, row.why_en)} status="available" />
            <Card heading={t('bodyHeading')} body={pick(row.body_th, row.body_en)} status="available" />
            <Card heading={t('nextHeading')} body={pick(row.what_next_th, row.what_next_en)} status="available" />
          </div>
        )
        : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}

      {questions.status === 'ok' && questions.questions ? (
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
      {questions.status === 'empty' ? <p>{tS('states.empty')} {questions.detail}</p> : null}
      {questions.status === 'error' ? <p>{tS('states.error')} {questions.detail}</p> : null}
      {questions.status === 'denied' ? <p>{tS('states.denied')} {questions.detail}</p> : null}
      {questions.status === 'unauthorized' ? <p>{tS('states.unauthorized')} {questions.detail}</p> : null}
      {questions.status === 'not-configured' ? <p>{tS('states.notConfigured')} {questions.detail}</p> : null}
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
