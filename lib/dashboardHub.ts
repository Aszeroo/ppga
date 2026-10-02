/**
 * Ticket #43 (#41 stage 2) dashboard hub derivation — PURE functions over
 * data the server already read (the gate RPC, the Course-map RPC, the XP
 * summary RPC, the hub table reads). Nothing here reaches the database and
 * nothing here decides a RULE: every function merely DESCRIBES what the
 * caller's own reads say — which module the linear lock rule left open,
 * whether the learner's own Mission rows say `complete`, whether the Final
 * Project's own submission row is with the Teacher. The `shellFrame.ts`
 * precedent: keeping the pure decisions out of the Server Component makes
 * them unit-testable and keeps the page a renderer.
 *
 * ZERO fabricated data: a `null` return means the datum is NOT there (no
 * rows, gate closed, map unseen) — the page then renders NO row, never a
 * made-up 0/empty state.
 */

/** One Course-map module as the `ppg_course_map` RPC speaks it. */
export interface HubModule {
  moduleKey: string
  orderIndex: number
  titleTh: string
  titleEn: string
  open: boolean
}

/** One submission round as the hub read speaks it (oldest first). */
export interface HubSubmission {
  missionId: string
  submissionSeq: number
  status: 'in_progress' | 'submitted' | 'needs_improvement' | 'approved'
  reviewVerdict: string | null
  reviewNotesTh: string | null
  reviewNotesEn: string | null
}

/** The learner's own completion flags (from their OWN mission rows). */
export type CompletedKeys = readonly string[]

/** The primary CTA: one destination, one copy key (`home.*`), server-derived.
 * A bare string is a typed top-level route; the object form names the FINAL
 * module whose review screen is the destination (the page builds the typed
 * dynamic route from the key — this module never speaks the router). */
export type HubCtaHref =
  | '/'
  | '/pre-test'
  | '/post-test'
  | '/survey'
  | '/course'
  | { reviewModuleKey: string }

export interface HubCta {
  href: HubCtaHref
  labelKey:
    | 'nextActionExplanation'
    | 'linkPreTest'
    | 'linkCourse'
    | 'linkPostTest'
    | 'linkSurvey'
    | 'linkReviewStatus'
}

/** The flags the state machine reads — every one is a server read's own
 * field, mapped by the page (never a client guess). */
export interface HubCtaFlags {
  /** `readGateViaTable().status === 'ok'` — otherwise the page speaks the
   * error/denied/unauthorized state and NO CTA renders. */
  gateOk: boolean
  consent: boolean
  override: boolean
  pretestSubmitted: boolean
  /** Both close reads answered `ok` (the old CloseChain's `ready`). */
  closeReady: boolean
  postUnlocked: boolean
  postSubmitted: boolean
  surveyUnlocked: boolean
  surveySubmitted: boolean
  /** The FINAL module's own latest submission round is with the Teacher. */
  awaitingReview: boolean
  awaitingReviewModuleKey: string | null
}

/**
 * The ONE primary CTA per state, same chain as before (consent → Pre-Test →
 * Course; Post-Test → Survey off the gate) with the ticket's awaiting-review
 * state between Course and the close chain's lock: the research close is
 * exactly what the Final Project review gates, so while that round is with
 * the Teacher, checking the review status IS the next action. After the
 * Survey, nothing is left: NO CTA (the closeDone copy speaks).
 */
export function pickPrimaryCta(f: HubCtaFlags): HubCta | null {
  if (!f.gateOk) return null
  if (!f.consent && !f.override) return { href: '/', labelKey: 'nextActionExplanation' }
  if (!f.pretestSubmitted && !f.override) return { href: '/pre-test', labelKey: 'linkPreTest' }
  if (f.closeReady && f.postUnlocked && !f.postSubmitted) return { href: '/post-test', labelKey: 'linkPostTest' }
  if (f.closeReady && f.surveyUnlocked && !f.surveySubmitted) return { href: '/survey', labelKey: 'linkSurvey' }
  if (f.awaitingReview && f.awaitingReviewModuleKey) return { href: { reviewModuleKey: f.awaitingReviewModuleKey }, labelKey: 'linkReviewStatus' }
  if (f.surveySubmitted) return null
  return { href: '/course', labelKey: 'linkCourse' }
}

/** Course progress: the learner's OWN completed Mission rows over the
 * modules the map showed them — a count of real rows, never a stored %. */
export function deriveCourseProgress(completedKeys: CompletedKeys, totalModules: number): { completed: number; total: number; progressPct: number } | null {
  if (totalModules <= 0) return null
  const completed = completedKeys.length
  return { completed, total: totalModules, progressPct: Math.round((completed / totalModules) * 100) }
}

/**
 * The current Mission: the HIGHEST-order module the lock rule left OPEN is
 * the learner's live module; its Mission is the one to do (practical kind if
 * the practical catalog lists the module, else knowledge). All open modules'
 * Missions already `complete` → null: no Mission is pending, so the row
 * renders nothing (the close chain speaks instead).
 */
export function deriveCurrentMission(
  modules: readonly HubModule[],
  completedKeys: CompletedKeys,
  practicalKeys: readonly string[],
): { moduleKey: string; titleTh: string; titleEn: string; kind: 'practical' | 'knowledge' } | null {
  let current: HubModule | null = null
  for (const m of modules) {
    if (m.open && (!current || m.orderIndex > current.orderIndex)) current = m
  }
  if (!current) return null
  if (completedKeys.includes(current.moduleKey)) return null
  const kind = practicalKeys.includes(current.moduleKey) ? 'practical' : 'knowledge'
  return {
    moduleKey: current.moduleKey,
    titleTh: current.titleTh,
    titleEn: current.titleEn,
    kind,
  }
}

/** The learner's latest own submission round (the read sorts oldest first). */
export function latestSubmission(submissions: readonly HubSubmission[]): HubSubmission | null {
  return submissions.length > 0 ? submissions[submissions.length - 1]! : null
}

/**
 * Awaiting review: the module the map ordered LAST is the Final Project (the
 * linear course ends there); when its latest own round is `submitted`, the
 * Teacher holds the decision that gates the research close. Returns the round
 * (+ its review-screen href) or null — the awaiting-review CTA + copy ride
 * that, never a claimed flag.
 */
export function deriveAwaitingReview(
  modules: readonly HubModule[],
  submissions: readonly HubSubmission[],
): { moduleKey: string } | null {
  let final: HubModule | null = null
  for (const m of modules) if (!final || m.orderIndex > final.orderIndex) final = m
  if (!final) return null
  const rounds = submissions.filter((s) => s.missionId === final!.moduleKey)
  const latest = rounds.length > 0 ? rounds[rounds.length - 1]! : null
  if (!latest || latest.status !== 'submitted') return null
  return { moduleKey: final.moduleKey }
}

/**
 * Relevant feedback: the learner's latest round that actually carries the
 * Teacher's notes (an un-reviewed round has none — then the row renders
 * nothing). The verdict + the bilingual notes ride the submission row the
 * review RPC stored — the real record, not a summary.
 */
export function deriveFeedback(submissions: readonly HubSubmission[]): HubSubmission | null {
  for (let i = submissions.length - 1; i >= 0; i -= 1) {
    const s = submissions[i]!
    if (s.reviewNotesTh || s.reviewNotesEn) return s
  }
  return null
}

/** The feedback row's presentation fields, defaulted once (the page's row
 * component then renders strings — no null-handling branches in JSX). */
export function submissionPresentation(
  s: HubSubmission,
  pick: (th: string, en: string) => string,
): { verdict: string; notes: string } {
  return {
    verdict: s.reviewVerdict ?? '',
    notes: pick(s.reviewNotesTh ?? '', s.reviewNotesEn ?? ''),
  }
}

/** One visible state line of the next-action card: a `home.*` copy key plus
 * the read's own detail string (the state's real print). */
export interface HubStateLine {
  key: string
  detail?: string
}

/** Which state lines the next-action card prints (the old screen spoke them
 * as per-status <p>s; the hub derives the SAME list as data, so the render
 * is one map — the statuses, their details and the close-chain locks are
 * unchanged, only the shape moved server-side→pure). */
export interface HubLinesInput {
  gateStatus: 'ok' | 'error' | 'denied' | 'unauthorized' | 'not-configured'
  gateDetail?: string
  consent: boolean
  override: boolean
  pretestSubmitted: boolean
  gateOpen: boolean
  closeReady: boolean
  postUnlocked: boolean
  surveySubmitted: boolean
  /** Either close read answered `error` (the old CloseChain's error line). */
  closeError: boolean
  closeDetail?: string
}

const GATE_STATUS_KEYS = {
  error: 'states.error',
  denied: 'states.denied',
  unauthorized: 'states.unauthorized',
  'not-configured': 'states.notConfigured',
} as const

export function deriveNextActionLines(i: HubLinesInput): HubStateLine[] {
  const gateOk = i.gateStatus === 'ok'
  const lines: HubStateLine[] = []
  if (gateOk && !i.consent && !i.override) lines.push({ key: 'states.noConsent', detail: i.gateDetail })
  if (gateOk && i.consent && !i.pretestSubmitted && !i.override) lines.push({ key: 'states.consentNoSubmit', detail: i.gateDetail })
  if (i.gateOpen) lines.push({ key: 'states.gateOpen', detail: i.gateDetail })
  if (i.gateOpen && i.closeReady && !i.postUnlocked) lines.push({ key: 'states.closeLocked' })
  if (gateOk && i.gateOpen && i.closeReady && i.surveySubmitted) lines.push({ key: 'states.closeDone' })
  if (!gateOk) lines.push({ key: GATE_STATUS_KEYS[i.gateStatus as keyof typeof GATE_STATUS_KEYS], detail: i.gateDetail })
  if (i.gateOpen && i.closeError) lines.push({ key: 'states.error', detail: i.closeDetail })
  return lines
}

/** ── The view-model assembly ─────────────────────────────────────────────
 * One pure function turns the SIX server reads (as the caller's JWT + RLS
 * answered them) into everything the hub renders: a null per summary row
 * means the datum is NOT there (no rows, unseen map, not-ok read) — the row
 * renders nothing, never a fabricated zero. The page then holds NO
 * decisions of its own: it reads, calls this, and renders. The read shapes
 * are mirrored structurally here (the page passes its reads straight in). */
export interface HubGateRead {
  status: 'ok' | 'error' | 'denied' | 'unauthorized' | 'not-configured'
  detail?: string
  consent?: boolean
  override?: boolean
  submitted?: boolean
}
export interface HubCloseRead {
  status: 'ok' | 'error' | 'denied' | 'unauthorized' | 'not-configured'
  detail?: string
  unlocked?: boolean
  submitted?: boolean
}
export interface HubMapRead {
  modules?: Array<{
    module_key: string
    order_index: number
    title_th: string
    title_en: string
    lock_state: 'open' | 'locked'
  }>
}
export interface HubRowsRead {
  status: string
  completedModuleKeys?: string[]
  practicalModuleKeys?: string[]
  submissions?: Array<{
    mission_id: string
    submission_seq: number
    status: 'in_progress' | 'submitted' | 'needs_improvement' | 'approved'
    review_verdict: string | null
    review_notes_th: string | null
    review_notes_en: string | null
  }>
}
export interface HubXpRead {
  status: string
  totalXp?: number
  level?: number
  xpToNext?: number
  progressPct?: number
  badges?: Array<{ badge_key: string; label_th: string; label_en: string }>
}

export interface HubReads {
  gate: HubGateRead
  posttest: HubCloseRead
  survey: HubCloseRead
  map: HubMapRead
  rows: HubRowsRead
  xp: HubXpRead
}

export interface HubViewModel {
  lines: HubStateLine[]
  cta: HubCta | null
  xp: { level: number; totalXp: number; xpToNext: number; progressPct: number } | null
  /** The earned awards (real rows); null hides the row entirely. */
  badges: NonNullable<HubXpRead['badges']> | null
  progress: { completed: number; total: number; progressPct: number } | null
  mission: { moduleKey: string; titleTh: string; titleEn: string; kind: 'practical' | 'knowledge' } | null
  submission: HubSubmission | null
  feedback: HubSubmission | null
}

/** ── The read normalizer (agent-3's decomposition, finished) ────────────
 * The ONE place the raw read shapes become defaults + camelCase: every `??`
 * lives here, so the flag/summary/assembly steps below are pure boolean
 * arithmetic over already-normalized data. Exported (and unit-tested) so the
 * defaults are pinned behavior, not an accident of the assembler. */
export interface NormalizedHub {
  gateOk: boolean
  gateOpen: boolean
  closeReady: boolean
  rowsOk: boolean
  xpOk: boolean
  gateStatus: HubGateRead['status']
  gateDetail?: string
  consent: boolean
  override: boolean
  pretestSubmitted: boolean
  closeError: boolean
  closeDetail?: string
  postUnlocked: boolean
  postSubmitted: boolean
  surveyUnlocked: boolean
  surveySubmitted: boolean
  modules: HubModule[]
  submissions: HubSubmission[]
  completedKeys: string[]
  practicalKeys: string[]
  totalModules: number
  xp: { level: number; totalXp: number; xpToNext: number; progressPct: number }
  badges: NonNullable<HubXpRead['badges']>
}

/** The gate read's flags with every default applied at the border. */
export function normalizeGateReads(gate: HubGateRead) {
  const gateOk = gate.status === 'ok'
  return {
    gateOk,
    gateOpen: gateOk && Boolean(gate.submitted || gate.override),
    gateStatus: gate.status,
    gateDetail: gate.detail,
    consent: gate.consent ?? false,
    override: gate.override ?? false,
    pretestSubmitted: gate.submitted ?? false,
  }
}

/** The two close reads' flags (the old CloseChain's `ready` + error line). */
export function normalizeCloseReads(posttest: HubCloseRead, survey: HubCloseRead) {
  return {
    closeReady: posttest.status === 'ok' && survey.status === 'ok',
    closeError: posttest.status === 'error' || survey.status === 'error',
    closeDetail: posttest.detail ?? survey.detail,
    postUnlocked: posttest.unlocked ?? false,
    postSubmitted: posttest.submitted ?? false,
    surveyUnlocked: survey.unlocked ?? false,
    surveySubmitted: survey.submitted ?? false,
  }
}

/** The Course-map read: the RPC's snake rows become `HubModule`s. */
function normalizeMapRead(map: HubMapRead) {
  const modules: HubModule[] = (map.modules ?? []).map((m) => ({
    moduleKey: m.module_key,
    orderIndex: m.order_index,
    titleTh: m.title_th,
    titleEn: m.title_en,
    open: m.lock_state === 'open',
  }))
  return { modules, totalModules: map.modules?.length ?? 0 }
}

/** The hub rows read: own completions + the practical set + camel rounds. */
function normalizeRowsRead(rows: HubRowsRead) {
  return {
    rowsOk: rows.status === 'ok',
    completedKeys: rows.completedModuleKeys ?? [],
    practicalKeys: rows.practicalModuleKeys ?? [],
    // camelCase for the derivations (the read speaks the table columns).
    submissions: (rows.submissions ?? []).map((s) => ({
      missionId: s.mission_id,
      submissionSeq: s.submission_seq,
      status: s.status,
      reviewVerdict: s.review_verdict,
      reviewNotesTh: s.review_notes_th,
      reviewNotesEn: s.review_notes_en,
    })),
  }
}

/** The XP summary read: level/progress numbers + the earned awards. */
function normalizeXpRead(xp: HubXpRead) {
  return {
    xpOk: xp.status === 'ok',
    xp: {
      level: xp.level ?? 1,
      totalXp: xp.totalXp ?? 0,
      xpToNext: xp.xpToNext ?? 100,
      progressPct: xp.progressPct ?? 0,
    },
    badges: xp.badges ?? [],
  }
}

export function normalizeHubReads(r: HubReads): NormalizedHub {
  return {
    ...normalizeGateReads(r.gate),
    ...normalizeCloseReads(r.posttest, r.survey),
    ...normalizeMapRead(r.map),
    ...normalizeRowsRead(r.rows),
    ...normalizeXpRead(r.xp),
  }
}

/** The five summary rows (the row builders): each rides its own read's own
 * ok-flag — a not-ok read yields null → the row renders nothing (the
 * zero-fabricated-data rule in one place). */
export function deriveHubSummary(
  n: NormalizedHub,
): Pick<HubViewModel, 'xp' | 'badges' | 'progress' | 'mission' | 'submission' | 'feedback'> {
  return {
    xp: n.xpOk ? n.xp : null,
    badges: n.xpOk && n.badges.length > 0 ? n.badges : null,
    progress: n.rowsOk ? deriveCourseProgress(n.completedKeys, n.totalModules) : null,
    mission: n.rowsOk ? deriveCurrentMission(n.modules, n.completedKeys, n.practicalKeys) : null,
    submission: n.rowsOk ? latestSubmission(n.submissions) : null,
    feedback: n.rowsOk ? deriveFeedback(n.submissions) : null,
  }
}

/**
 * The view-model assembly: normalize the six reads, ask the derivations,
 * hand the page its model. No defaults, no shapes, no decisions live here —
 * they all have exactly one owner above.
 */
export function buildHubView(r: HubReads): HubViewModel {
  const n = normalizeHubReads(r)
  const awaiting = n.rowsOk ? deriveAwaitingReview(n.modules, n.submissions) : null
  return {
    lines: deriveNextActionLines({
      gateStatus: n.gateStatus,
      gateDetail: n.gateDetail,
      consent: n.consent,
      override: n.override,
      pretestSubmitted: n.pretestSubmitted,
      gateOpen: n.gateOpen,
      closeReady: n.closeReady,
      postUnlocked: n.postUnlocked,
      surveySubmitted: n.surveySubmitted,
      closeError: n.closeError,
      closeDetail: n.closeDetail,
    }),
    cta: pickPrimaryCta({
      gateOk: n.gateOk,
      consent: n.consent,
      override: n.override,
      pretestSubmitted: n.pretestSubmitted,
      closeReady: n.closeReady,
      postUnlocked: n.postUnlocked,
      postSubmitted: n.postSubmitted,
      surveyUnlocked: n.surveyUnlocked,
      surveySubmitted: n.surveySubmitted,
      awaitingReview: awaiting !== null,
      awaitingReviewModuleKey: awaiting?.moduleKey ?? null,
    }),
    ...deriveHubSummary(n),
  }
}
