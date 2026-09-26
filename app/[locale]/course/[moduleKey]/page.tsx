import { Suspense } from 'react'

import { useLocale, useTranslations } from 'next-intl'
import { Link } from '../../../../lib/i18n/routing'

import { readLessonsViaRpc } from '../../../../lib/sup/curriculum'
import { Card } from '../../../../components/Card'

/**
 * Ticket #9 module detail: the Lessons an OPEN module shows (the
 * `ppg_module_lessons` RPC — published + the gate + the module OPEN for a
 * learner; a locked module returns `[]` server-side so the page shows the
 * locked state text, the lesson rows are INACCESSIBLE server-side, never a
 * hidden UI). `force-dynamic` because the page reads the detail through the
 * session JWT. Every state (`lesson.list`, `lesson.states.*`,
 * `lesson.linkMap`, `lesson.fallbackSuspense`) has its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function LessonsList({ moduleKey }: { moduleKey: string }) {
  const t = useTranslations('lesson')
  const locale = useLocale()
  const state = await readLessonsViaRpc(moduleKey)
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  return (
    <section aria-label={t('list')}>
      {state.status === 'ok'
        ? state.lessons
          ?.sort((a, b) => a.order_index - b.order_index)
          .map((row) => (
            <Card
              key={row.lesson_key}
              heading={`${row.order_index}. ${pick(row.title_th, row.title_en)}`}
              body={pick(row.what_learn_th, row.what_learn_en)}
              status="available"
            />
          ))
        : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      <p>
        <Link href="/course">{t('linkMap')}</Link>
      </p>
    </section>
  )
}

export default function ModulePage({ params }: { params: { moduleKey: string } }) {
  const t = useTranslations('lesson')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <LessonsList moduleKey={params.moduleKey} />
    </Suspense>
  )
}
