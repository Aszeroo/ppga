/**
 * Ticket #45 (#41 stage 4) challenge-sequence model: the PURE derivation the
 * learner module surfaces render — Lesson → Self-Check → Mission → Result as
 * an ordered CHALLENGE track reusing the stage-map vocabulary of #44
 * (`cleared | open | locked` states + the real current-challenge frontier),
 * the mission panel's `challenge | success | clear` state, the unlock
 * feedback (the DATABASE's own next-module `open` — never an invented event)
 * and the XP reward lookup (the CALLER's own `ppg_xp_ledger` rows — the
 * ledger IS the grant, nothing here claims a reward the ledger does not
 * carry). No rules live here: availability is the server reads' own ok/empty
 * (the gate + the linear rule decide), a check-pass/mission-pass/approval is
 * a ledger row, a completion is the learner's own `complete` Mission row.
 * No server imports: unit-testable like `lib/courseStages.ts`.
 */
import { type StageState } from './courseStages'

/** The sequence's steps, in the ORDER the learner walks them. */
export type ChallengeStepKey = 'lesson' | 'selfcheck' | 'mission' | 'result'

/** The mission panel's three framing states (#45 AC): challenge (attempt it
 * now), success (a REAL reward event landed), clear (the Module is complete). */
export type MissionPanelState = 'challenge' | 'success' | 'clear'

/** The structural shape of a `readOwnXpEventsViaTable` row (no server-only
 * import; the ledger's PK is (learner_id, event_type, event_ref)). */
export interface LedgerEventRow {
  learner_id: string
  event_type: string
  event_ref: string
  amount: number
}

/** The structural shape of `readOwnXpEventsViaTable`'s result. */
export interface LedgerRead {
  status: string
  detail?: string
  uid?: string
  rows?: LedgerEventRow[]
}

/** The minimal course-map row shape the unlock feedback reads (the SAME rows
 * `readCourseMapViaRpc` carries — only the lock truth, never a claim). */
export interface MapLockRow {
  module_key: string
  order_index: number
  lock_state: 'open' | 'locked'
  title_th?: string
  title_en?: string
}

/** One derived step of the sequence — the state + (for the Self-Check step)
 * the lesson the check actually lives on; the page attaches the localized
 * titles/copy and composes the hrefs (routes are the page's, not the
 * model's). */
export interface ChallengeStep {
  key: ChallengeStepKey
  orderIndex: number
  state: StageState
  /** The lesson carrying the next UNPASSED Self-Check (the check the learner
   * should be doing), or the first visible one when none is pending. */
  checkTargetLessonKey?: string
}

/** Everything the track needs, already decided by the SERVER reads — each
 * flag is a read's own truth the page read under the caller's JWT. */
export interface ChallengeStepsInput {
  /** The module's lesson read is ok (lessons VISIBLE server-side). */
  lessonsVisible: boolean
  /** The visible lesson keys (the lesson read's own rows). */
  visibleLessonKeys: readonly string[]
  /** The caller's OWN `self_check_pass` refs (ledger) — a check the learner
   * actually passed. */
  ownPassedCheckKeys: readonly string[]
  /** The module's Mission kind (the practical-catalog table speaks it). */
  missionKind: 'knowledge' | 'practical'
  /** The mission availability read is ok (gate + rule + check passed — the
   * SERVER's decision, never a re-implementation). */
  missionAvailable: boolean
  /** The learner's OWN `complete` Mission row for the module. */
  completed: boolean
  /** The learner's OWN XP grant event for the module exists (ledger). */
  rewardEventExists: boolean
  /** Practical: the learner has an OWN submission round. */
  submissionExists: boolean
  /** Practical: an APPROVED review verdict stands (the real clear). */
  approved: boolean
}

/** The caller's OWN ledger rows IN JS: `ppg_xp_ledger_select` already filters
 * a learner to their own rows, but a teacher/admin's role sees EVERYONE's —
 * on a learner surface only rows whose `learner_id` IS the caller may show a
 * reward (the #44 own-rows rule, re-applied: a Teacher browsing a Mission
 * never sees another learner's granted XP). */
export function ownLedgerEvents(read: LedgerRead): LedgerEventRow[] {
  if (read.status !== 'ok') return []
  const uid = read.uid ?? ''
  return (read.rows ?? []).filter((r) => r.learner_id === uid)
}

/** The one ledger row the PK speaks for (type, ref) — or null: THE grant
 * record itself, never a copy of it. */
export function ledgerEvent(
  own: readonly LedgerEventRow[],
  type: string,
  ref: string,
): LedgerEventRow | null {
  return own.find((r) => r.event_type === type && r.event_ref === ref) ?? null
}

/** The lesson keys whose Self-Check the caller actually passed (the ledger's
 * own `self_check_pass` refs — there is NO other completion authority for a
 * Lesson; the ledger's ref IS the lesson_key). */
export function passedLessonKeys(own: readonly LedgerEventRow[]): string[] {
  return own.filter((r) => r.event_type === 'self_check_pass').map((r) => r.event_ref)
}

/** The chip marker the ledger row itself speaks: `event_type:event_ref` —
 * the PK shape of the grant record that put the XP on the learner. */
export function ledgerEventAttr(row: LedgerEventRow): string {
  return `${row.event_type}:${row.event_ref}`
}

/** The module's OWN reward row: knowledge pass, or the practical approval /
 * the Final Project (both are real grants the ledger carries). */
export function moduleRewardEvent(
  own: readonly LedgerEventRow[],
  kind: 'knowledge' | 'practical',
  moduleKey: string,
): LedgerEventRow | null {
  if (kind === 'knowledge') return ledgerEvent(own, 'knowledge_mission_pass', moduleKey)
  return (
    ledgerEvent(own, 'practical_approval', moduleKey) ??
    ledgerEvent(own, 'final_project', moduleKey)
  )
}

/** The per-step STATE derivations (one honest guard each — `buildChallengeSteps`
 * composes them, keeping every decision independently readable). */

/** The lesson step: open while its content is visible — a Lesson has NO
 * completion authority (only its Self-Check does), so it never claims
 * `cleared`; the locked module read locks it too. */
function lessonStepState(lessonsVisible: boolean): StageState {
  return lessonsVisible ? 'open' : 'locked'
}

/** The Self-Check step: cleared only when EVERY visible lesson carries the
 * caller's own `self_check_pass` ledger row. */
function selfcheckStepState(
  lessonsVisible: boolean,
  pendingChecks: readonly string[],
): StageState {
  if (!lessonsVisible) return 'locked'
  return pendingChecks.length === 0 ? 'cleared' : 'open'
}

/** The mission step: cleared by the OWN `complete` Mission row; open while
 * the availability read is ok (the SERVER's gate); locked when it is not. */
function missionStepState(
  completed: boolean,
  missionAvailable: boolean,
): StageState {
  if (completed) return 'cleared'
  return missionAvailable ? 'open' : 'locked'
}

/** The result step: practical — cleared by an APPROVED verdict, open once a
 * real submission round exists; knowledge — cleared by the real pass event,
 * open while the Mission is attemptable (the history IS the result). */
function resultStepState(input: ChallengeStepsInput): StageState {
  if (input.missionKind === 'practical') {
    if (input.approved || input.completed) return 'cleared'
    return input.submissionExists ? 'open' : 'locked'
  }
  if (input.rewardEventExists) return 'cleared'
  return input.missionAvailable || input.completed ? 'open' : 'locked'
}

/**
 * The ordered challenge track: every step, its state the reads speak (the
 * per-step rules live in the `*StepState` helpers above — the states the
 * SERVER's own reads decide, never re-implemented here).
 */
export function buildChallengeSteps(input: ChallengeStepsInput): ChallengeStep[] {
  const pendingChecks = input.visibleLessonKeys.filter(
    (k) => !input.ownPassedCheckKeys.includes(k),
  )
  const checkTarget = pendingChecks[0] ?? input.visibleLessonKeys[0]
  return [
    { key: 'lesson', orderIndex: 1, state: lessonStepState(input.lessonsVisible) },
    {
      key: 'selfcheck',
      orderIndex: 2,
      state: selfcheckStepState(input.lessonsVisible, pendingChecks),
      checkTargetLessonKey: input.lessonsVisible ? checkTarget : undefined,
    },
    { key: 'mission', orderIndex: 3, state: missionStepState(input.completed, input.missionAvailable) },
    { key: 'result', orderIndex: 4, state: resultStepState(input) },
  ]
}

/** The first step the learner still has OPEN — the sequence's frontier (the
 * same "first open" rule the stage map's direction speaks); null when
 * everything is cleared or the road is locked beyond reach. */
export function deriveCurrentStep(steps: readonly ChallengeStep[]): ChallengeStep | null {
  return steps.find((s) => s.state === 'open') ?? null
}

/** The mission panel's framing state, from the real signals ONLY: a real
 * completion clears it; a real ledger grant makes it success; an attemptable
 * Mission is the challenge; NOTHING renders no panel (the page's own state
 * copy speaks the denial) — a fake grant can never show here. */
export function missionPanelState(flags: {
  available: boolean
  rewardEventExists: boolean
  completed: boolean
}): MissionPanelState | null {
  if (flags.completed) return 'clear'
  if (flags.rewardEventExists) return 'success'
  if (flags.available) return 'challenge'
  return null
}

/** The module's own row in the course-map read (its `order_index` the next
 * lookup needs) — null when the caller cannot see the module at all. */
function findMapRow(
  rows: readonly MapLockRow[],
  moduleKey: string,
): MapLockRow | null {
  return rows.find((r) => r.module_key === moduleKey) ?? null
}

/** The module that FOLLOWS the given order (smallest greater order_index). */
function findNextModuleRow(
  rows: readonly MapLockRow[],
  orderIndex: number,
): MapLockRow | null {
  const later = rows.filter((r) => r.order_index > orderIndex)
  if (later.length === 0) return null
  return later.reduce((a, b) => (b.order_index < a.order_index ? b : a))
}

/**
 * The unlock feedback: ONLY when the learner's OWN completion stands AND the
 * DATABASE's map read already speaks the next module `open` — the unlock is
 * the server's own lock state, never a claimed flag (the #44 rule re-read:
 * the journey observes the transition, the page states what the read says).
 */
export function deriveUnlockFeedback(
  completed: boolean,
  nextRow: MapLockRow | null,
): MapLockRow | null {
  return completed && nextRow && nextRow.lock_state === 'open' ? nextRow : null
}

/** ── The page-level composition (structural reads in, context out) ─────
 *
 * The SAME pattern `buildStageMapView` speaks (#44): the caller reads under
 * the session JWT, this only NAMES what the reads already say — no server
 * imports, unit-testable, keeps every module page thin. */

/** Structural shape of the lesson read (`LessonsState`). */
export interface ChallengeLessonsRead {
  status: string
  lessons?: Array<{ lesson_key: string }>
}

/** Structural shape of `readOwnCompletedModuleKeysViaTable` (`CompletedMissionRead`). */
export interface ChallengeCompletedRead {
  status: string
  uid?: string
  rows?: Array<{ module_key: string; learner_id: string }>
}

/** Structural shape of `readPracticalMissionKeysViaTable`. */
export interface ChallengeKindsRead {
  status: string
  keys?: string[]
}

/** Structural shape of an availability read (mission/practical reads share
 * the status field the gate speaks). */
export interface ChallengeAvailabilityRead {
  status: string
}

/** Structural shape of the course-map read (`CourseMapState`). */
export interface ChallengeMapRead {
  status: string
  modules?: MapLockRow[]
}

/** Everything the loader hands the pure composer (the loader already picked
 * the availability read of the module's OWN kind). */
export interface ChallengeReadInput {
  lessons: ChallengeLessonsRead
  ledger: LedgerRead
  completed: ChallengeCompletedRead
  kinds: ChallengeKindsRead
  availability: ChallengeAvailabilityRead
  map: ChallengeMapRead
}

/** Signals only a page-local read carries (the practical page's OWN
 * submission history). */
export interface ChallengeExtras {
  submissionExists?: boolean
}

/** The assembled challenge context every module surface renders from. */
export interface ChallengeContext {
  /** The caller's OWN ledger rows (teacher/admin rows filtered out). */
  own: LedgerEventRow[]
  kind: 'knowledge' | 'practical'
  lessonsVisible: boolean
  visibleLessonKeys: string[]
  /** Checks the caller actually passed, limited to the visible lessons. */
  passed: string[]
  completed: boolean
  /** The module's OWN reward row (null = nothing was ever granted). */
  reward: LedgerEventRow | null
  missionAvailable: boolean
  steps: ChallengeStep[]
  current: ChallengeStep | null
  /** The next module the learner's OWN completion really opened. */
  unlockedRow: MapLockRow | null
}

export function buildChallengeContext(
  moduleKey: string,
  r: ChallengeReadInput,
  extras: ChallengeExtras = {},
): ChallengeContext {
  const own = ownLedgerEvents(r.ledger)
  const kind: 'knowledge' | 'practical' =
    r.kinds.status === 'ok' && (r.kinds.keys ?? []).includes(moduleKey) ? 'practical' : 'knowledge'
  const visibleLessonKeys = (r.lessons.lessons ?? []).map((l) => l.lesson_key)
  const lessonsVisible = visibleLessonKeys.length > 0
  const passed = passedLessonKeys(own).filter((k) => visibleLessonKeys.includes(k))
  const completed = (r.completed.rows ?? [])
    .some((row) => row.learner_id === (r.completed.uid ?? '') && row.module_key === moduleKey)
  const reward = moduleRewardEvent(own, kind, moduleKey)
  const missionAvailable = r.availability.status === 'ok'
  const steps = buildChallengeSteps({
    lessonsVisible,
    visibleLessonKeys,
    ownPassedCheckKeys: passed,
    missionKind: kind,
    missionAvailable,
    completed,
    rewardEventExists: reward !== null,
    submissionExists: extras.submissionExists ?? false,
    // the approval IS what grants the practical reward row — the ledger's
    // own record speaks the verdict, no extra read invented.
    approved: kind === 'practical' && reward !== null,
  })
  const mapRows = r.map.status === 'ok' ? (r.map.modules ?? []) : []
  const ownRow = findMapRow(mapRows, moduleKey)
  return {
    own,
    kind,
    lessonsVisible,
    visibleLessonKeys,
    passed,
    completed,
    reward,
    missionAvailable,
    steps,
    current: deriveCurrentStep(steps),
    unlockedRow: deriveUnlockFeedback(
      completed,
      ownRow ? findNextModuleRow(mapRows, ownRow.order_index) : null,
    ),
  }
}

/** A track step's route (structural — every member is a shape the routing's
 * `AppHref` accepts, the way the Course page already passes them). */
export type ChallengeStepLink =
  | { pathname: '/course/[moduleKey]/[lessonKey]'; params: { moduleKey: string; lessonKey: string } }
  | { pathname: '/course/[moduleKey]/mission'; params: { moduleKey: string } }
  | { pathname: '/course/[moduleKey]/practical'; params: { moduleKey: string } }
  | { pathname: '/course/[moduleKey]/review'; params: { moduleKey: string } }

/**
 * The track step's route — shared by every module surface (#45): a step only
 * links when it is NOT locked (the #44 no-fake-unlock rule: a locked step is
 * visible, never a link). The Lesson step points at the module's first
 * visible Lesson, the Self-Check step at the lesson carrying the next
 * UNPASSED check, the Mission step at the kind's own screen (knowledge
 * attempt vs practical upload), the Result step at the review verdict
 * (practical) or the Mission's own score history (knowledge).
 */
export function challengeStepHref(
  step: ChallengeStep,
  moduleKey: string,
  ctx: Pick<ChallengeContext, 'kind' | 'visibleLessonKeys'>,
): ChallengeStepLink | undefined {
  if (step.state === 'locked') return undefined
  switch (step.key) {
    case 'lesson':
      return ctx.visibleLessonKeys.length > 0
        ? {
          pathname: '/course/[moduleKey]/[lessonKey]',
          params: { moduleKey, lessonKey: ctx.visibleLessonKeys[0] },
        }
        : undefined
    case 'selfcheck':
      return step.checkTargetLessonKey
        ? {
          pathname: '/course/[moduleKey]/[lessonKey]',
          params: { moduleKey, lessonKey: step.checkTargetLessonKey },
        }
        : undefined
    case 'mission':
      return ctx.kind === 'practical'
        ? { pathname: '/course/[moduleKey]/practical', params: { moduleKey } }
        : { pathname: '/course/[moduleKey]/mission', params: { moduleKey } }
    case 'result':
      return ctx.kind === 'practical'
        ? { pathname: '/course/[moduleKey]/review', params: { moduleKey } }
        : { pathname: '/course/[moduleKey]/mission', params: { moduleKey } }
    default:
      return undefined
  }
}

/** The unlock band's module label (the course map's own title when the read
 * carries it, its key otherwise — nothing invented either way). */
function unlockModuleTitle(row: MapLockRow, locale: string): string {
  const title = locale === 'th' ? row.title_th : row.title_en
  return `${String(row.order_index).padStart(2, '0')}. ${title ?? row.module_key}`
}

/** The unlock band the cleared surfaces render (the same composition for
 * the Mission panel and the module page): copy + the real next module's
 * label + its route — NULL (nothing renders) unless the learner's OWN
 * completion actually opened a module the DATABASE speaks as open. */
export function buildUnlockBand(
  ctx: Pick<ChallengeContext, 'unlockedRow'>,
  copy: string,
  locale: string,
): { copy: string; title: string; href: { pathname: '/course/[moduleKey]'; params: { moduleKey: string } } } | null {
  if (!ctx.unlockedRow) return null
  return {
    copy,
    title: unlockModuleTitle(ctx.unlockedRow, locale),
    href: { pathname: '/course/[moduleKey]', params: { moduleKey: ctx.unlockedRow.module_key } },
  }
}

/** The localized copy bundle the challenge framing speaks — ONE adapter
 * over the `challenge.*` key map shared by all five module surfaces (`t`
 * is the page's own `getTranslations('challenge')` read; the model only
 * shapes the keys, the messages own the copy). */
export interface ChallengeCopy {
  title: (key: ChallengeStepKey) => string
  state: (state: StageState) => string
  stateCopy: (state: MissionPanelState) => string
  current: string
  rewardNote: string
  unlockNext: string
}

export function challengeCopyFrom(t: (key: string) => string): ChallengeCopy {
  return {
    title: (key) => t(`steps.${key}`),
    state: (state) => t(`states.${state}`),
    stateCopy: (state) => t(`states.${state}`),
    current: t('current'),
    rewardNote: t('rewardNote'),
    unlockNext: t('unlockNext'),
  }
}

/** One composed track item for the `ChallengeTrack` primitive (the copy
 * arrives as translations the page already resolved — the model never
 * localizes, it only composes). */
export interface ChallengeTrackStepView {
  key: ChallengeStepKey
  orderIndex: number
  title: string
  stateCopy: string
  state: StageState
  isCurrent: boolean
  currentCopy: string
  href: ChallengeStepLink | undefined
}

/**
 * The track's composed steps — the SAME composition every module surface
 * renders (the five pages share it here instead of each re-spelling the
 * step→title/state-copy/route map: the vocabulary is the model's, the copy
 * is the page's). `limit` trims the sequence (the Lesson page walks the
 * first three steps); `unlinkedStep` suppresses one step's own link (the
 * Result page IS its step).
 */
export function challengeTrackSteps(
  ctx: ChallengeContext,
  moduleKey: string,
  copy: Pick<ChallengeCopy, 'title' | 'state' | 'current'>,
  opts: { limit?: number; unlinkedStep?: ChallengeStepKey } = {},
): ChallengeTrackStepView[] {
  const steps = opts.limit === undefined ? ctx.steps : ctx.steps.slice(0, opts.limit)
  return steps.map((step) => ({
    key: step.key,
    orderIndex: step.orderIndex,
    title: copy.title(step.key),
    stateCopy: copy.state(step.state),
    state: step.state,
    isCurrent: ctx.current?.key === step.key,
    currentCopy: copy.current,
    href: step.key === opts.unlinkedStep ? undefined : challengeStepHref(step, moduleKey, ctx),
  }))
}

/** The reward chip's props from the module's OWN ledger row (null when
 * nothing was ever granted — no fake grants). Structural twin of the
 * `XpRewardChip` props; the lib imports no component. */
export interface RewardChipView {
  amount: number
  eventAttr: string
  label: string
}

export function rewardChipProps(
  ctx: Pick<ChallengeContext, 'reward'>,
  label: string,
): RewardChipView | null {
  return ctx.reward
    ? { amount: ctx.reward.amount, eventAttr: ledgerEventAttr(ctx.reward), label }
    : null
}

/** The Mission panel's composed view: its `challenge | success | clear`
 * state (null = the page renders NO panel), the localized state copy, the
 * REAL reward chip, the REAL unlock band and the `cleared` note flag. */
export interface ChallengePanelView {
  panel: MissionPanelState | null
  stateCopy: string
  reward: RewardChipView | null
  unlocked: NonNullable<ReturnType<typeof buildUnlockBand>> | null
  cleared: boolean
}

/**
 * The panel composition shared by the knowledge and practical attempt pages
 * (the pages keep only their OWN availability read — status + the presence
 * of the mission payload — while every framing decision rides the model:
 * a read the server denies yields NO panel, a real grant the SUCCESS/CLEAR
 * state, the unlock band only what the map read already speaks).
 */
export function challengePanelView(
  ctx: ChallengeContext,
  read: { status: string; hasContent: boolean },
  copy: Pick<ChallengeCopy, 'stateCopy' | 'rewardNote' | 'unlockNext'>,
  locale: string,
): ChallengePanelView {
  const attemptable = read.status === 'ok' && read.hasContent
  const panel = attemptable
    ? missionPanelState({ available: true, rewardEventExists: ctx.reward !== null, completed: ctx.completed })
    : null
  return {
    panel,
    stateCopy: panel ? copy.stateCopy(panel) : '',
    reward: rewardChipProps(ctx, copy.rewardNote),
    unlocked: buildUnlockBand(ctx, copy.unlockNext, locale),
    cleared: panel === 'clear' || panel === 'success',
  }
}
