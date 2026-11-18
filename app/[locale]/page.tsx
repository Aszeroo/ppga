import { Suspense } from 'react'

import { getLocale, getTranslations } from 'next-intl/server'
import { Link } from '../../lib/i18n/routing'

import { readGateViaTable } from '../../lib/sup/prettest'
import { readPosttestState, readFinalTestState } from '../../lib/sup/posttest'
import { readSurveyState } from '../../lib/sup/survey'
import { readXpSummaryViaRpc } from '../../lib/sup/xp'
import { readCourseMapViaRpc } from '../../lib/sup/curriculum'
import { readHubRowsViaTables } from '../../lib/sup/hub'
import { readChapterProgressData } from '../../lib/sup/chapterProgress'
import { readOwnProfile } from '../../lib/sup/profile'
import {
  buildHubView,
  type HubStateLine,
  type HubViewModel,
} from '../../lib/dashboardHub'
import { chapterStatusText, type LoopAction } from '../../lib/chapterProgress'
import { XPBar } from '../../components/XPBar'
import { ProgressBar } from '../../components/ProgressBar'
import { Badge } from '../../components/Badge'
import { RewardCelebration } from '../../components/RewardCelebration'

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
 * Post-Test → Survey), and a compact player-status summary: Level, XP,
 * progress toward the next Level, course progress (the learner's own
 * `complete` Mission rows over the modules the map showed), earned badges
 * (the awards), and the current Mission (the highest-OPEN module's, linked).
 * PPGA #85 removed the retired submission-status, review CTA and feedback
 * cards from this screen. ZERO fabricated data — every value is a row/RPC the
 * server already owns; a missing datum renders NO row. Rank never renders
 * here (the Leaderboard destination owns it). Teacher/Admin keep the
 * utilitarian legacy screen (the issue: full 8-bit framing is LEARNER
 * surfaces only).
 */
export const dynamic = 'force-dynamic'

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
  action: LoopAction | null
  actionLabel: string | null
  explanation: string | null
}

function HubNextActionView({ tCopy, lines, action, actionLabel, explanation }: NextActionViewProps) {
  return (
    <section aria-label={tCopy('nextAction')} data-ppg-hub="next-action" className="ppg-hub-hero">
      <div className="ppg-hero-main">
        <h1 className="ppg-heading ppg-heading-text ppg-hero-title">{tCopy('nextAction')}</h1>
        {lines.map((line) => (
          <p className="ppg-card-text ppg-state-line" key={line.key}>
            {tCopy(line.key)} {line.detail}
          </p>
        ))}
        {explanation ? <p className="ppg-card-text ppg-state-line">{explanation}</p> : null}
      </div>
      {action && action.href && actionLabel ? (
        <p className="ppg-hero-cta-row">
          {/** The ONE primary CTA of the CAI loop — the login submit's
           * `.ppg-cta` face as a link (the class carries the focus ring +
           * reduced-motion rules). */}
          <Link className="ppg-cta" data-ppg-cta="primary" href={action.href as never}>
            {actionLabel}
          </Link>
        </p>
      ) : null}
    </section>
  )}

/** The copy closures every hub row needs (bilingual text + locale pick). */
interface HubCopy {
  tCopy: (key: string) => string
  htCopy: (key: string) => string
  pick: (th: string, en: string) => string
}

/**
 * The compact player-status summary — PPGA #52: the gallery's `#s-dash`
 * status row (the gold XP panel + the white `card strip lift` cards: course
 * progress, achievements, the current Mission). PPGA #85 removed the
 * submission-status and feedback cards: the worksheet journey is retired, so
 * the dashboard never promises a file submission or a Teacher review. Every
 * row prop is EITHER real view data or null (a missing datum renders no card:
 * zero fabricated data). The row types ride the view model (ONE declaration
 * in `dashboardHub`, no re-typed twins here). Rank stays on the Leaderboard
 * destination, never here. Each row is its own tiny component: the presence
 * decision has one guard, and the grid is a branchless list of cards.
 */
interface StatusViewProps {
  copy: HubCopy
  xp: HubViewModel['xp']
  badges: HubViewModel['badges']
  progress: HubViewModel['chapterProgress']
  chapter: HubViewModel['currentChapter']
}

function XpRow({ copy, xp }: { copy: HubCopy; xp: StatusViewProps['xp'] }) {
  if (!xp) return null
  // Level N runs from (N-1)*100 to N*100, so the pair is the learner's real
  // position in the level; the old `totalXp / xpToNext` printed the remaining
  // XP as the denominator ("2300 / 100").
  return (
    <div className="ppg-xp-panel">
      <p className="ppg-xp-panel-row">
        <span>
          <span aria-hidden="true">⭐ </span>
          {copy.htCopy('level')} {xp.level}
        </span>
        <span>
          <span aria-hidden="true">⚡ </span>
          {copy.htCopy('progress')} {xp.totalXp} / {xp.level * 100} {copy.htCopy('xpUnit')}
        </span>
      </p>
      <XPBar xp={xp.totalXp} level={xp.level} />
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

function ChapterRow({ copy, chapter }: { copy: HubCopy; chapter: StatusViewProps['chapter'] }) {
  if (!chapter) return null
  const status = chapterStatusText(chapter, {
    pre: copy.tCopy('chapterStatus.pre'),
    post: copy.tCopy('chapterStatus.post'),
    mission: copy.tCopy('chapterStatus.mission'),
    missionDone: copy.tCopy('chapterStatus.missionDone'),
    missionPending: copy.tCopy('chapterStatus.missionPending'),
    notStarted: copy.tCopy('chapterStatus.notStarted'),
    passed: copy.tCopy('chapterStatus.passed'),
    notPassed: copy.tCopy('chapterStatus.notPassed'),
  })
  return (
    <div className="ppg-status-card ppg-strip-top">
      <h3 className="ppg-status-card-title">
        <span aria-hidden="true">🎯 </span>
        {copy.tCopy('chapterCurrent')}
      </h3>
      <p className="ppg-status-card-value">
        {chapter.order_index}. {copy.pick(chapter.title_th, chapter.title_en)}
      </p>
      <p className="ppg-card-text">{status}</p>
      <Link
        className="ppg-link"
        href={{
          pathname: '/course/[moduleKey]' as const,
          params: { moduleKey: chapter.chapter_key },
        }}
      >
        {copy.tCopy('linkContent')}
      </Link>
    </div>
  )
}

function HubStatusView({ copy, xp, badges, progress, chapter }: StatusViewProps) {
  return (
    <section aria-label={copy.tCopy('statusLabel')} data-ppg-hub="status">
      <h2 className="ppg-heading ppg-heading-text ppg-hub-status-title">{copy.tCopy('statusLabel')}</h2>
      <XpRow copy={copy} xp={xp} />
      <div className="ppg-hub-grid">
        <ProgressRow copy={copy} progress={progress} />
        <BadgesRow copy={copy} badges={badges} />
        <ChapterRow copy={copy} chapter={chapter} />
      </div>
    </section>
  )
}

/** The learner hub: the ONE place the dashboard reads (the gate, the close
 * reads, the Course map, the hub rows, XP, the chapter attempt stream and the
 * Final Test aggregate — the caller's JWT + RLS throughout). Every decision
 * lives in the pure `buildHubView` / `chapterProgress` functions, the
 * components only render. */
async function LearnerHub() {
  const t = await getTranslations('home')
  const ht = await getTranslations('header')
  const tR = await getTranslations('reward')
  const locale = await getLocale()
  const [gate, posttest, survey, map, rows, xp, chapterData, finalTest] = await Promise.all([
    readGateViaTable(),
    readPosttestState(),
    readSurveyState(),
    readCourseMapViaRpc(),
    readHubRowsViaTables(),
    readXpSummaryViaRpc(),
    readChapterProgressData(),
    readFinalTestState(),
  ])
  const view = buildHubView({
    gate,
    posttest,
    survey,
    map,
    rows,
    xp,
    chapterAttempts: chapterData.status === 'ok' ? { status: 'ok', rows: chapterData.attempts } : { status: chapterData.status },
    finalTest,
  })
  const pick = (th: string, en: string) => (locale === 'th' ? th : en)
  const tRaw = t as unknown as (key: string, values?: Record<string, string | number>) => string
  const action = view.nextAction
  const chapterTitle = pick(action?.chapterTitleTh ?? '', action?.chapterTitleEn ?? '')
  const actionValues = { chapter: chapterTitle, n: String(action?.chapterOrder ?? '') }
  return (
    <div className="ppg-page-wrap">
      <HubNextActionView
        tCopy={(key) => t(key as never)}
        lines={view.lines.filter(
          (line) => !['states.gateOpen', 'states.closeLocked', 'states.closeDone'].includes(line.key),
        )}
        action={action}
        actionLabel={action ? tRaw(action.labelKey, actionValues) : null}
        explanation={action?.explanationKey ? tRaw(action.explanationKey, actionValues) : null}
      />
      <HubStatusView
        copy={{ tCopy: (key) => t(key as never), htCopy: (key) => ht(key as never), pick }}
        xp={view.xp}
        badges={view.badges}
        progress={view.chapterProgress}
        chapter={view.currentChapter}
      />
      {/* #53: the level-up celebration — the hub is the ONLY page that reads
          the derived level, so it owns the LEVEL section. The first observed
          level is recorded as a baseline and never celebrated; the popup
          speaks a witnessed INCREASE only, with the server's own number.
          No `.ppg-cta` / no success-tone pill / no hub-scoped marker: the
          CTA count and `expectBadge`'s gates are untouched. */}
      <RewardCelebration
        level={view.xp?.level ?? null}
        copy={{ title: tR('title'), dismiss: tR('dismiss'), levelLabel: ht('level') }}
      />
    </div>
  )
}

/** One destination card on the staff overview: the icon is decoration, the
 * title doubles as the link's accessible name, and the description is shown
 * only when an existing `messages/*` key describes the destination. */
interface StaffCard {
  key: string
  href: string
  icon: string
  title: string
  description?: string
}

function StaffCard({ card }: { card: StaffCard }) {
  return (
    <div className="ppg-status-card ppg-strip-top" data-ppg-staff-card={card.key}>
      <h2 className="ppg-status-card-title">
        <Link className="ppg-link" href={card.href as never}>
          <span aria-hidden="true">{card.icon} </span>
          {card.title}
        </Link>
      </h2>
      {card.description ? <p className="ppg-card-text">{card.description}</p> : null}
    </div>
  )
}

/**
 * The Teacher/Admin overview. The learner gate/close screen belongs to the
 * learner loop (a staff account has no consent by construction, so it showed
 * a misleading consent explanation and research-close sentence). Staff get
 * the destinations they actually own instead: the same routes the role nav
 * carries, each as a card with a title, an existing short description and a
 * plain `.ppg-link`. No hero CTA: the cards are the actions, so the ONE
 * `.ppg-cta` rule is untouched. Every label/description is an existing
 * `messages/*` key — no new copy, no client code, no extra DB read (the
 * layout already read the role).
 */
async function StaffHome({ role }: { role: 'teacher' | 'admin' }) {
  const tShell = await getTranslations('shell')
  const tProgress = await getTranslations('teacherProgress')
  const tHealth = await getTranslations('health')
  const tNav = await getTranslations('nav')
  const tHome = await getTranslations('home')
  const tAdmin = await getTranslations('admin')

  const roleTitle = role === 'admin' ? tShell('userAdmin') : tShell('userTeacher')
  const progressCard: StaffCard = {
    key: 'progress',
    href: '/teacher/progress',
    icon: '📈',
    title: tProgress('title'),
    description: tProgress('sub'),
  }
  const healthCard: StaffCard = {
    key: 'health',
    href: '/health',
    icon: '🩺',
    title: role === 'admin' ? tNav('health') : tHealth('systemTitle'),
    description: tHealth('systemSub'),
  }
  const commonCards: StaffCard[] = [
    { key: 'leaderboard', href: '/leaderboard', icon: '🥇', title: tHome('linkLeaderboard') },
    { key: 'profile', href: '/profile', icon: '👤', title: tNav('profile') },
  ]
  const adminCards: StaffCard[] =
    role === 'admin'
      ? [
          {
            key: 'publication',
            href: '/admin/publication',
            icon: '📖',
            title: tNav('coursePublication'),
            description: tAdmin('publication.sub'),
          },
          {
            key: 'users',
            href: '/admin/users',
            icon: '👥',
            title: tNav('adminUsers'),
            description: tAdmin('users.sub'),
          },
          { key: 'audit', href: '/admin/audit', icon: '📜', title: tNav('adminAudit') },
          {
            key: 'provisioning',
            href: '/admin/provisioning',
            icon: '📥',
            title: tNav('adminProvisioning'),
          },
          { key: 'export', href: '/admin/export', icon: '📦', title: tNav('adminExport') },
        ]
      : []
  const cards = [progressCard, ...adminCards, healthCard, ...commonCards]

  return (
    <div className="ppg-page-wrap" data-ppg-hub="staff" data-ppg-staff-role={role}>
      <section aria-label={roleTitle} className="ppg-hub-hero">
        <div className="ppg-hero-main">
          <h1 className="ppg-heading ppg-heading-text ppg-hero-title">{roleTitle}</h1>
          <p className="ppg-card-text ppg-state-line">{tProgress('sub')}</p>
        </div>
      </section>
      <section aria-label={roleTitle}>
        <div className="ppg-hub-grid">
          {cards.map((card) => (
            <StaffCard key={card.key} card={card} />
          ))}
        </div>
      </section>
    </div>
  )
}

export default async function HomePage() {
  const t = await getTranslations('home')
  const profile = await readOwnProfile()
  const role = profile.status === 'ok' ? profile.row?.role : undefined
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <main>
        {role === 'learner' ? (
          <LearnerHub />
        ) : (
          <StaffHome role={role === 'admin' ? 'admin' : 'teacher'} />
        )}
      </main>
    </Suspense>
  )
}
