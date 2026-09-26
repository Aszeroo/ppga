import { Suspense } from 'react'

import { useLocale, useTranslations } from 'next-intl'
import { Link } from '../../../../../lib/i18n/routing'

import { readLessonsViaRpc } from '../../../../../lib/sup/curriculum'
import { readSelfCheckQuestionsViaRpc } from '../../../../../lib/sup/xp'
import { Card } from '../../../../../components/Card'
import { Badge } from '../../../../../components/Badge'
import { StatusPill } from '../../../../../components/StatusPill'

/**
 * Ticket #9 + #10 lesson view: the #16 story's WHAT / WHY / BODY / WHAT-
 * NEXT structure from the DATABASE's own bilingual columns (the
 * `ppg_module_lessons` RPC filtered to the CALLER's lesson; a locked module
 * returns `[]` server-side so the page shows the unavailable state text),
 * and the #10 Self-Check that ENDS the Lesson: the DATABASE's own questions
 * the SEE-ABLE Lesson shows (the `ppg_self_check_questions` RPC — the
 * answer key NEVER lands in the jsonb; a locked/draft/arched Lesson returns
 * `[]`, never a hidden UI), the retry form (the native POST to
 * /api/self-check/submit runs the `ppg_check_self_check` RPC — the
 * DATABASE's own answer-key sum decides pass/fail server-side; unlimited
 * retries), and the +50/First Steps notes the ledger/badge PKs speak
 * (exactly-once grants). `force-dynamic` because the page reads through
 * the session JWT. Every state (`lesson.view.*`, `lesson.states.*`,
 * `lesson.linkModule`, `lesson.fallbackSuspense`,
 * `selfcheck.section.*`, `selfcheck.states.*`) has its own copy in
 * `messages`.
 */
export const dynamic = 'force-dynamic'

async function LessonView({ moduleKey, lessonKey }: { moduleKey: string; lessonKey: string }) {
  const t = useTranslations('lesson')
  const tS = useTranslations('selfcheck')
  const locale = useLocale()
  const state = await readLessonsViaRpc(moduleKey)
  const row = state.lessons?.find((l) => l.lesson_key === lessonKey)
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  const questions = await readSelfCheckQuestionsViaRpc(lessonKey)
  return (
    <section aria-label={t('viewTitle')}>
      {row
        ? (
          <>
            <Card heading={t('whatHeading')} body={pick(row.what_learn_th, row.what_learn_en)} status="available" />
            <Card heading={t('whyHeading')} body={pick(row.why_th, row.why_en)} status="available" />
            <Card heading={t('bodyHeading')} body={pick(row.body_th, row.body_en)} status="available" />
            <Card heading={t('nextHeading')} body={pick(row.what_next_th, row.what_next_en)} status="available" />
          </>
        )
        : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}

      {questions.status === 'ok' && questions.questions ? (
        <section aria-label={tS('section')}>
          <h2>{tS('section')}</h2>
          <form method="POST" action="/api/self-check/submit" data-ppg-self-check-form="selfcheck" aria-label={tS('submitLabel')}>
            <input name="lesson_key" defaultValue={lessonKey} hidden={true} />
            {questions.questions.map((q) => (
              <label key={`${q.lesson_key}-${q.order_index}-${q.option_key}`} htmlFor={`answer_${q.order_index}`}>
                <input type="radio" id={`answer_${q.order_index}_${q.option_key}`} name={`answer_${q.order_index}`} defaultValue={q.option_key} />
                <span aria-hidden="true">{q.option_key}</span> {pick(q.option_th, q.option_en)}
                {pick(q.prompt_th, q.prompt_en)}
              </label>
            ))}
            <button type="submit">{tS('submitLabel')}</button>
          </form>
          <p>{tS('retryHint')}</p>
        </section>
      ) : null}
      {questions.status === 'empty' ? <p>{tS('states.empty')} {questions.detail}</p> : null}
      {questions.status === 'error' ? <p>{tS('states.error')} {questions.detail}</p> : null}
      {questions.status === 'denied' ? <p>{tS('states.denied')} {questions.detail}</p> : null}
      {questions.status === 'unauthorized' ? <p>{tS('states.unauthorized')} {questions.detail}</p> : null}
      {questions.status === 'not-configured' ? <p>{tS('states.notConfigured')} {questions.detail}</p> : null}
      {questions.status === 'ok' ? (
        <p>
          <StatusPill tone="success" label={tS('passState')} />
          <Badge text={tS('badgeNote')} tone="success" />
        </p>
      ) : null}
      <p>
        <Link href={{ pathname: '/course/[moduleKey]', params: { moduleKey } }}>{t('linkModule')}</Link>
      </p>
      <p>
        <Link href="/course">{t('linkMap')}</Link>
      </p>
    </section>
  )
}

export default function LessonPage({ params }: { params: { moduleKey: string; lessonKey: string } }) {
  const t = useTranslations('lesson')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <LessonView moduleKey={params.moduleKey} lessonKey={params.lessonKey} />
    </Suspense>
  )
}