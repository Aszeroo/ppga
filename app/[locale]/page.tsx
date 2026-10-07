import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../lib/i18n/routing'

import { readGateViaTable } from '../../lib/sup/prettest'
import { readPosttestState } from '../../lib/sup/posttest'
import { readSurveyState } from '../../lib/sup/survey'
import { readXpSummaryViaRpc } from '../../lib/sup/xp'
import { readCourseMapViaRpc } from '../../lib/sup/curriculum'
import { readHubRowsViaTables } from '../../lib/sup/hub'
import { readOwnProfile } from '../../lib/sup/profile'
import {
  buildHubView,
  submissionPresentation,
  type HubCtaHref,
  type HubStateLine,
  type HubViewModel,
} from '../../lib/dashboardHub'
import { XPBar } from '../../components/XPBar'
import { ProgressBar } from '../../components/ProgressBar'
import { Badge } from '../../components/Badge'
import { StatusPill } from '../../components/StatusPill'

/**
 * Ticket #8 dashboard (the home): the next action per state, always shown
 * (#13 story) — a Learner without consent sees the respectful explanation
 * and no access to the Pre-Test; a consenting un-submitted Learner sees
 * the Pre-Test screen only; a submitted (or audited-override) Learner sees
 * the Course. The gate status rides the DATABASE's own flags + the
 * response's own `submitted_at` under the CALLER's JWT + RLS — the UI's
 * state machine speaks the same authority the content gate reads at the row
 * level, never a hidden UI. `force-dynamic` because the page reads the gate
 * through the session JWT — `next build` must never pre-render someone
 * else's gate state.
 *
 * Ticket #43 (#41 stage 2): inside the Shell, the LEARNER's dashboard is the
 * game-hub next-action screen — ONE primary CTA (the `.ppg-cta` face as of
 * #52, carrying the `data-ppg-cta` primary marker) chosen by `pickPrimaryCta` off
 * the SAME server reads the old screen spoke (gate → Pre-Test → Course;
 * Post-Test → Survey) plus the ticket's awaiting-review state (the FINAL
 * module's own submission round is `submitted` — the Teacher holds the
 * research-close decision), and a compact player-status summary: Level, XP,
 * progress toward the next Level, course progress (the learner's own
 * `complete` Mission rows over the modules the map showed), earned badges
 * (the awards), the current Mission (the highest-OPEN module's, linked), the
 * latest submission round + its status, and the Teacher's feedback where a
 * round carries notes. ZERO fabricated data — every value is a row/RPC the
 * server already owns; a missing datum renders NO row. Rank never renders
 * here (the Leaderboard destination owns it). Teacher/Admin keep the
 * utilitarian legacy screen (the issue: full 8-bit framing is LEARNER
 * surfaces only).
 */
export const dynamic = 'force-dynamic'

/** The submission status → its `home.states.*` copy key (bilingual state
 * word beside the raw DB token — state never a colour-only cue). */
function submissionStateKey(status: string): string {
  return (
    {
      in_progress: 'inProgress',
      submitted: 'submitted',
      needs_improvement: 'needsImprovement',
      approved: 'approved',
    } as Record<string, string>
  )[status] ?? 'empty'
}

/** The submission status → the StatusPill tone (colour rides ALONGSIDE the
 * text label + raw token, never alone). */
function submissionTone(status: string): 'success' | 'warning' | 'error' {
  if (status === 'approved') return 'success'
  if (status === 'needs_improvement') return 'error'
  return 'warning'
}

/** The CTA destination → the typed Link target (the review CTA rides the
 * FINAL module's dynamic route; everything else is a top-level route). */
function ctaTarget(href: HubCtaHref) {
  if (typeof href !== 'string') {
    return { pathname: '/course/[moduleKey]/review' as const, params: { moduleKey: href.reviewModuleKey } }
  }
  return href
}

/** The learner's next-action card: the state lines the old screen spoke
 * (`deriveNextActionLines` — same statuses, same details) + the ONE primary
 * CTA. PPGA #52: the V3 next-mission hero (the gallery's `#s-dash` mission
 * hero — the 6px-pink gradient card), the ONE primary action riding the
 * `.ppg-cta` face with the `data-ppg-cta` primary marker (exactly one per
 * context — the AC's binding rule). The CTA's text is EXACTLY the label (the
 * journey's `toHaveText` reads it verbatim — decoration never rides the CTA). */
interface NextActionViewProps {
  tCopy: (key: string) => string
  lines: HubStateLine[]
  cta: { href: HubCtaHref; label: string } | null
}

function HubNextActionView({ tCopy, lines, cta }: NextActionViewProps) {
  return (
    <section aria-label={tCopy('nextAction')} data-ppg-hub="next-action" className="ppg-hub-hero">
      <h1 className="ppg-heading ppg-heading-text ppg-hero-title">{tCopy('nextAction')}</h1>
      {lines.map((line) => (
        <p className="ppg-card-text ppg-state-line" key={line.key}>
          {tCopy(line.key)} {line.detail}
        </p>
      ))}
      {cta ? (
        <p className="ppg-hero-cta-row">
          {/** The ONE primary CTA — the login submit's `.ppg-cta` face as a
           * link (the class carries the focus ring + reduced-motion rules). */}
          <Link className="ppg-cta" data-ppg-cta="primary" href={ctaTarget(cta.href)}>
            {cta.label}
          </Link>
        </p>
      ) : null}
    </section>
  )}

/** The current-Mission row's typed route (the practical kind is the upload
 * screen, the knowledge kind the quiz). */
function missionRoute(mission: StatusViewProps['mission']) {
  if (!mission) return { pathname: '/course' as const }
  if (mission.kind === 'practical') {
    return { pathname: '/course/[moduleKey]/practical' as const, params: { moduleKey: mission.moduleKey } }
  }
  return { pathname: '/course/[moduleKey]/mission' as const, params: { moduleKey: mission.moduleKey } }
}

/** The copy closures every hub row needs (bilingual text + locale pick). */
interface HubCopy {
  tCopy: (key: string) => string
  htCopy: (key: string) => string
  pick: (th: string, en: string) => string
}

/**
 * The compact player-status summary — PPGA #52: the gallery's `#s-dash`
 * status row (the gold XP panel + the white `card strip lift` cards: course
 * progress, achievements, submission status, feedback). Every row prop is
 * EITHER real view data or null (a missing datum renders no card: zero
 * fabricated data). The row types ride the view model (ONE declaration in
 * `dashboardHub`, no re-typed twins here). Rank stays on the Leaderboard
 * destination, never here. Each row is its own tiny component: the presence
 * decision has one guard, and the grid is a branchless list of cards.
 */
interface StatusViewProps {
  copy: HubCopy
  xp: HubViewModel['xp']
  badges: HubViewModel['badges']
  progress: HubViewModel['progress']
  mission: HubViewModel['mission']
  submission: HubViewModel['submission']
  feedback: HubViewModel['feedback']
}

function XpRow({ copy, xp }: { copy: HubCopy; xp: StatusViewProps['xp'] }) {
  if (!xp) return null
  return (
    <div className="ppg-xp-panel">
      <p className="ppg-xp-panel-row">
        <span>
          <span aria-hidden="true">⭐ </span>
          {copy.htCopy('level')} {xp.level}
        </span>
        <span>
          <span aria-hidden="true">⚡ </span>
          {copy.htCopy('progress')} {xp.totalXp} / {xp.xpToNext} {copy.htCopy('xpUnit')}
        </span>
      </p>
      <XPBar xp={xp.totalXp} level={xp.level} />
      <ProgressBar value={xp.progressPct} />
    </div>
  )
}

function ProgressRow({ copy, progress }: { copy: HubCopy; progress: StatusViewProps['progress'] }) {
  if (!progress) return null
  return (
    <div className="ppg-status-card ppg-strip-top">
      <h3 className="ppg-status-card-title">
        <span aria-hidden="true">📚 </span>
        {copy.tCopy('courseProgress')}
      </h3>
      <p className="ppg-status-card-value">
        {progress.completed} / {progress.total}
      </p>
      <ProgressBar value={progress.progressPct} label={copy.tCopy('courseProgress')} />
    </div>
  )
}

function BadgesRow({ copy, badges }: { copy: HubCopy; badges: StatusViewProps['badges'] }) {
  if (!badges) return null
  return (
    <div className="ppg-status-card ppg-strip-top">
      <h3 className="ppg-status-card-title">
        <span aria-hidden="true">🏆 </span>
        {copy.htCopy('badge')}
      </h3>
      <p className="ppg-status-card-value">
        {badges.map((b) => (
          // PPGA #51: the V3 HUD is chip-only (XP + LV), so the earned badge's
          // observable moved here — the award row's own `badge_key` rides the
          // chip as a marker (the `data-ppg-xp-event` PK-marker idiom: server-
          // authored data rendered as a stable test seam, never a fake).
          <span key={b.badge_key} data-ppg-badge={b.badge_key}>
            <Badge text={copy.pick(b.label_th, b.label_en)} tone="success" />
          </span>
        ))}
      </p>
    </div>
  )
}

function MissionRow({ copy, mission }: { copy: HubCopy; mission: StatusViewProps['mission'] }) {
  if (!mission) return null
  return (
    <div className="ppg-status-card ppg-strip-top">
      <h3 className="ppg-status-card-title">
        <span aria-hidden="true">🎯 </span>
        {copy.tCopy('missionCurrent')}
      </h3>
      <p className="ppg-status-card-value">
        {copy.pick(mission.titleTh, mission.titleEn)} —{' '}
        <Link className="ppg-link" href={missionRoute(mission)}>
          {copy.tCopy('linkContent')}
        </Link>
      </p>
    </div>
  )
}

function SubmissionRow({ copy, submission }: { copy: HubCopy; submission: StatusViewProps['submission'] }) {
  if (!submission) return null
  return (
    <div className="ppg-status-card ppg-strip-top">
      <h3 className="ppg-status-card-title">
        <span aria-hidden="true">📤 </span>
        {copy.tCopy('submissionLabel')}
      </h3>
      <p className="ppg-status-card-value">
        {submission.missionId} #{submission.submissionSeq}{' '}
        <StatusPill
          tone={submissionTone(submission.status)}
          label={`${copy.tCopy(`states.${submissionStateKey(submission.status)}`)} (${submission.status})`}
        />
      </p>
    </div>
  )
}

function FeedbackRow({ copy, feedback }: { copy: HubCopy; feedback: StatusViewProps['feedback'] }) {
  if (!feedback) return null
  const shown = submissionPresentation(feedback, copy.pick)
  return (
    <div className="ppg-status-card ppg-strip-top">
      <h3 className="ppg-status-card-title">
        <span aria-hidden="true">🧑‍🏫 </span>
        {copy.tCopy('feedbackLabel')}
      </h3>
      <p className="ppg-status-card-value">
        {feedback.missionId} ({shown.verdict}) {shown.notes}
      </p>
    </div>
  )
}

function HubStatusView({ copy, xp, badges, progress, mission, submission, feedback }: StatusViewProps) {
  return (
    <section aria-label={copy.tCopy('statusLabel')} data-ppg-hub="status">
      <h2 className="ppg-heading ppg-heading-text ppg-hub-status-title">{copy.tCopy('statusLabel')}</h2>
      <XpRow copy={copy} xp={xp} />
      <div className="ppg-hub-grid">
        <ProgressRow copy={copy} progress={progress} />
        <BadgesRow copy={copy} badges={badges} />
        <MissionRow copy={copy} mission={mission} />
        <SubmissionRow copy={copy} submission={submission} />
        <FeedbackRow copy={copy} feedback={feedback} />
      </div>
    </section>
  )
}

/** The learner hub: the ONE place the dashboard reads (six server reads,
 * the caller's JWT + RLS throughout); every decision lives in the pure
 * `buildHubView` (unit-tested), the components only render. */
async function LearnerHub() {
  const t = await getTranslations('home')
  const ht = await getTranslations('header')
  const locale = await getLocale()
  const [gate, posttest, survey, map, rows, xp] = await Promise.all([
    readGateViaTable(),
    readPosttestState(),
    readSurveyState(),
    readCourseMapViaRpc(),
    readHubRowsViaTables(),
    readXpSummaryViaRpc(),
  ])
  const view = buildHubView({ gate, posttest, survey, map, rows, xp })
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  return (
    <div className="ppg-page-wrap">
      <HubNextActionView
        tCopy={(key) => t(key as never)}
        lines={view.lines}
        cta={view.cta ? { href: view.cta.href, label: t(view.cta.labelKey) } : null}
      />
      <HubStatusView
        copy={{ tCopy: (key) => t(key as never), htCopy: (key) => ht(key as never), pick }}
        xp={view.xp}
        badges={view.badges}
        progress={view.progress}
        mission={view.mission}
        submission={view.submission}
        feedback={view.feedback}
      />
    </div>
  )
}

/**
 * Ticket #15 research close (the dashboard's next action after the Course):
 * the Post-Test unlocks on the Final Project's ACCEPTANCE, the Survey follows
 * the Post-Test — the unlocks ride the DATABASE's own gate functions (the
 * completion the Teacher's approval writes; the learner's own submitted
 * Post-Test stamp), never a browser-smuggled flag. Nothing here grants a
 * reward: the close instruments are research, not currency (ADR-0001).
 * Kept for the Teacher/Admin utilitarian home (stage 2's framing is
 * LEARNER-only) — the old screen verbatim.
 */
async function LegacyNextAction() {
  const t = await getTranslations('home')
  const state = await readGateViaTable()
  return (
    <section aria-label={t('nextAction')}>
      {state.status === 'ok' && !state.consent && !state.override ? <p>{t('states.noConsent')} {state.detail}</p> : null}
      {state.status === 'ok' && !state.consent && !state.override ? <p><Link href="/">{t('nextActionExplanation')}</Link></p> : null}
      {state.status === 'ok' && state.consent && !state.submitted && !state.override ? <p>{t('states.consentNoSubmit')} {state.detail}</p> : null}
      {state.status === 'ok' && state.consent && !state.submitted && !state.override ? <p><Link href="/pre-test">{t('linkPreTest')}</Link></p> : null}
      {state.status === 'ok' && (state.submitted || state.override) ? <p>{t('states.gateOpen')} {state.detail}</p> : null}
      {state.status === 'ok' && (state.submitted || state.override) ? <p><Link href="/course">{t('linkCourse')}</Link></p> : null}
      {state.status === 'error' ? <p>{t('states.error')} {state.detail}</p> : null}
      {state.status === 'denied' ? <p>{t('states.denied')} {state.detail}</p> : null}
      {state.status === 'unauthorized' ? <p>{t('states.unauthorized')} {state.detail}</p> : null}
      {state.status === 'not-configured' ? <p>{t('states.notConfigured')} {state.detail}</p> : null}
    </section>
  )
}

async function LegacyCloseChain() {
  const t = await getTranslations('home')
  const posttest = await readPosttestState()
  const survey = await readSurveyState()
  const ready = posttest.status === 'ok' && survey.status === 'ok'
  return (
    <section aria-label={t('closeLabel')}>
      {ready && !posttest.unlocked ? <p>{t('states.closeLocked')}</p> : null}
      {ready && posttest.unlocked && !posttest.submitted ? (
        <p>
          <Link href="/post-test">{t('linkPostTest')}</Link>
        </p>
      ) : null}
      {ready && survey.unlocked && !survey.submitted ? (
        <p>
          <Link href="/survey">{t('linkSurvey')}</Link>
        </p>
      ) : null}
      {ready && survey.submitted ? <p>{t('states.closeDone')}</p> : null}
      {posttest.status === 'error' || survey.status === 'error' ? <p>{t('states.error')} {posttest.detail ?? survey.detail}</p> : null}
    </section>
  )
}

export default async function HomePage() {
  const t = await getTranslations('home')
  const profile = await readOwnProfile()
  const isLearner = profile.status === 'ok' && profile.row?.role === 'learner'
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <main>
        {isLearner ? (
          <LearnerHub />
        ) : (
          <>
            <LegacyNextAction />
            <LegacyCloseChain />
            <section>
              <Link href="/health">{t('healthLink')}</Link>
            </section>
            <section aria-label={t('linkLeaderboard')}>
              <Link href="/leaderboard">{t('linkLeaderboard')}</Link>
            </section>
          </>
        )}
      </main>
    </Suspense>
  )
}
