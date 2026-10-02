import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../../../lib/i18n/routing'

import { readLessonsViaRpc } from '../../../../lib/sup/curriculum'
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
 * rides the module's OWN kind (the catalog table speaks upload vs knowledge).
 * `force-dynamic` because the page reads the detail through the session JWT.
 * Every state (`lesson.list`, `lesson.states.*`, `lesson.linkMap`,
 * `lesson.fallbackSuspense`, `challenge.*`) has its own copy in `messages`.
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
    <section aria-label={t('list')}>
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
          <p data-ppg-unlock="next-module">
            {unlocked.copy}{' '}
            <Link
              href={unlocked.href}
              className="ppg-button"
              style={{ display: 'inline-block', fontFamily: 'var(--font-ta16bit), var(--font-mitr)' }}
            >
              {unlocked.title}
            </Link>
          </p>
        )
        : null}
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
      {ctx.steps.find((s) => s.key === 'mission')?.state !== 'locked'
        ? (
          <p>
            <Link
              href={ctx.kind === 'practical'
                ? { pathname: '/course/[moduleKey]/practical', params: { moduleKey } }
                : { pathname: '/course/[moduleKey]/mission', params: { moduleKey } }}
            >
              {t('linkMission')}
            </Link>
          </p>
        )
        : null}
      <p>
        <Link href="/course">{t('linkMap')}</Link>
      </p>
    </section>
  )
}

export default async function ModulePage({ params }: { params: Promise<{ moduleKey: string }> }) {
  const t = await getTranslations('lesson')
  const { moduleKey } = await params
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <LessonsList moduleKey={moduleKey} />
    </Suspense>
  )
}
