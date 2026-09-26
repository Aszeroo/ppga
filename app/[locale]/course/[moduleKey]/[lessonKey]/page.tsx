import { Suspense } from 'react'

import { useLocale, useTranslations } from 'next-intl'
import { Link } from '../../../../../lib/i18n/routing'

import { readLessonsViaRpc } from '../../../../../lib/sup/curriculum'
import { Card } from '../../../../../components/Card'

/**
 * Ticket #9 lesson view: the #16 story's WHAT / WHY / BODY / WHAT-NEXT
 * structure, from the DATABASE's own bilingual columns (the
 * `ppg_module_lessons` RPC filtered to the CALLER's lesson; a locked module
 * returns `[]` server-side so the page shows the unavailable state text —
 * the lesson content is INACCESSIBLE server-side, never a hidden UI).
 * `force-dynamic` because the page reads the content through the session
 * JWT. Every state (`lesson.view.*`, `lesson.states.*`,
 * `lesson.linkModule`, `lesson.fallbackSuspense`) has its own copy in
 * `messages`.
 */
export const dynamic = 'force-dynamic'

async function LessonView({ moduleKey, lessonKey }: { moduleKey: string; lessonKey: string }) {
  const t = useTranslations('lesson')
  const locale = useLocale()
  const state = await readLessonsViaRpc(moduleKey)
  const row = state.lessons?.find((l) => l.lesson_key === lessonKey)
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  return (
    <section aria-label={t('viewTitle')}>
      {row
        ? (
          <>
            <Card
              heading={t('whatHeading')}
              body={pick(row.what_learn_th, row.what_learn_en)}
              status="available"
            />
            <Card
              heading={t('whyHeading')}
              body={pick(row.why_th, row.why_en)}
              status="available"
            />
            <Card
              heading={t('bodyHeading')}
              body={pick(row.body_th, row.body_en)}
              status="available"
            />
            <Card
              heading={t('nextHeading')}
              body={pick(row.what_next_th, row.what_next_en)}
              status="available"
            />
          </>
        )
        : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      <p>
        <Link href="/course/[moduleKey]">{t('linkModule')}</Link>
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
