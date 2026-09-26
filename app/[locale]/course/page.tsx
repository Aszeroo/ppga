import { Suspense } from 'react'

import { useLocale, useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

import { readCourseMapViaRpc } from '../../../lib/sup/curriculum'
import { Card } from '../../../components/Card'

/**
 * Ticket #9 Course map: the seeded Modules + their real LOCK states (the
 * `ppg_course_map` RPC — every SEE-ABLE module, the lock state the linear
 * rule computes server-side, never a client-decided lock flag). A Learner
 * who has not passed the #8 gate reaches this pathname as the middleware's
 * redirect to the Pre-Test (the DATABASE's own policy denies the map at the
 * row level, never a hidden UI); the locked modules show AS locked (a
 * stripe + the "Locked" text + `aria-disabled`, never a colour-only cue).
 * `force-dynamic` because the page reads the map through the session JWT —
 * `next build` must never pre-render someone else's lock states. Every
 * state (`course.map.*`, `course.states.*`, `course.fallbackSuspense`) has
 * its own copy in `messages`.
 */
export const dynamic = 'force-dynamic'

async function CourseMap() {
  const t = useTranslations('course')
  const locale = useLocale()
  const state = await readCourseMapViaRpc()
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  return (
    <section aria-label={t('mapLabel')}>
      {state.status === 'ok'
        ? state.modules
          ?.sort((a, b) => a.order_index - b.order_index)
          .map((row) => (
            <Card
              key={row.module_key}
              heading={`${row.order_index}. ${pick(row.title_th, row.title_en)}`}
              body={`${pick(row.summary_th, row.summary_en)} — ${
                row.lock_state === 'open' ? t('states.open') : t('states.locked')
              }`}
              status={row.lock_state === 'locked' ? 'locked' : 'available'}
            />
          ))
        : null}
      {state.status === 'empty' ? <p>{t('states.empty')} {state.detail}</p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
      <p>
        <Link href="/">{t('linkDashboard')}</Link>
      </p>
      <p>
        <Link href="/pre-test">{t('linkPreTest')}</Link>
      </p>
    </section>
  )
}

export default function CoursePage() {
  const t = useTranslations('course')
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <main>
        <CourseMap />
      </main>
    </Suspense>
  )
}
