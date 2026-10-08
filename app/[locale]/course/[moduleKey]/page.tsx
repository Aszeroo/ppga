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
        <Link className="ppg-link" href="/course">{t('linkMap')}</Link>
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
