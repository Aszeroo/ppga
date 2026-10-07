import { test, expect } from 'vitest'

import {
  buildHubView,
  deriveAwaitingReview,
  deriveCourseProgress,
  deriveCurrentMission,
  deriveFeedback,
  deriveHubSummary,
  deriveNextActionLines,
  latestSubmission,
  normalizeCloseReads,
  normalizeGateReads,
  normalizeHubReads,
  pickPrimaryCta,
  submissionPresentation,
  type HubCtaFlags,
  type HubModule,
  type HubSubmission,
} from '../../lib/dashboardHub'

import fs from 'node:fs'

/**
 * Ticket #43 (#41 stage 2) unit tests: the DASHBOARD HUB's pure decisions —
 * the ONE primary CTA per state (the ticket's AC chain: fresh → the consent
 * explanation, consented → the Pre-Test, mid-course → the Course, the FINAL
 * Project `submitted` → the review status, the Post-Test eligible → the
 * Post-Test, the Survey eligible → the Survey, done → NO CTA), the course
 * progress COUNT (the learner's own `complete` rows, never a stored %), the
 * current Mission (the highest-OPEN module's — practical kind for the upload
 * modules, hidden once its own row says `complete`), and the real-data rows
 * (latest submission round, the Teacher's notes where they exist) — the
 * `shellFrame.ts` precedent: the pure functions unit-test here, the Server
 * Component they feed rides the e2e journey.
 */

const flags = (over: Partial<HubCtaFlags> = {}): HubCtaFlags => ({
  gateOk: true,
  consent: false,
  override: false,
  pretestSubmitted: false,
  closeReady: true,
  postUnlocked: false,
  postSubmitted: false,
  surveyUnlocked: false,
  surveySubmitted: false,
  awaitingReview: false,
  awaitingReviewModuleKey: null,
  ...over,
})

test('CTA chain: fresh sees the explanation, the consenting see the Pre-Test, the gated see the Course', () => {
  expect(pickPrimaryCta(flags())).toEqual({ href: '/', labelKey: 'nextActionExplanation' })
  expect(pickPrimaryCta(flags({ consent: true }))).toEqual({ href: '/pre-test', labelKey: 'linkPreTest' })
  expect(pickPrimaryCta(flags({ consent: true, pretestSubmitted: true }))).toEqual({
    href: '/course',
    labelKey: 'linkCourse',
  })
  // the audited override opens the gate WITHOUT the learner's own consent.
  expect(pickPrimaryCta(flags({ override: true }))).toEqual({ href: '/course', labelKey: 'linkCourse' })
})

test('CTA chain: awaiting review, then the Post-Test, then the Survey, then NOTHING', () => {
  const gateOpen = { consent: true, pretestSubmitted: true }
  expect(
    pickPrimaryCta(flags({ ...gateOpen, awaitingReview: true, awaitingReviewModuleKey: 'module-11' })),
  ).toEqual({ href: { reviewModuleKey: 'module-11' }, labelKey: 'linkReviewStatus' })
  // the close chain outranks the review check (a done round is not awaiting).
  expect(pickPrimaryCta(flags({ ...gateOpen, postUnlocked: true }))).toEqual({
    href: '/post-test',
    labelKey: 'linkPostTest',
  })
  expect(pickPrimaryCta(flags({ ...gateOpen, postUnlocked: true, postSubmitted: true, surveyUnlocked: true }))).toEqual({
    href: '/survey',
    labelKey: 'linkSurvey',
  })
  expect(pickPrimaryCta(flags({ ...gateOpen, postUnlocked: true, postSubmitted: true, surveyUnlocked: true, surveySubmitted: true }))).toBeNull()
})

test('CTA: a gate read that is NOT ok renders no CTA (the page speaks the error state)', () => {
  expect(pickPrimaryCta(flags({ gateOk: false, consent: true, pretestSubmitted: true }))).toBeNull()
})

const modules: HubModule[] = [
  { moduleKey: 'module-01', orderIndex: 1, titleTh: 'ท1', titleEn: 'M1', open: true },
  { moduleKey: 'module-02', orderIndex: 2, titleTh: 'ท2', titleEn: 'M2', open: true },
  { moduleKey: 'module-08', orderIndex: 8, titleTh: 'ท8', titleEn: 'M8', open: false },
  { moduleKey: 'module-11', orderIndex: 11, titleTh: 'ท11', titleEn: 'M11', open: false },
]
const practical = ['module-08', 'module-11']

test('course progress = the OWN complete rows over the modules seen (never a stored %)', () => {
  expect(deriveCourseProgress([], 11)).toEqual({ completed: 0, total: 11, progressPct: 0 })
  expect(deriveCourseProgress(['module-01'], 11)).toEqual({ completed: 1, total: 11, progressPct: 9 })
  // no map seen → no datum → NO row (zero fabricated data).
  expect(deriveCourseProgress(['module-01'], 0)).toBeNull()
})

test('current Mission = the highest-OPEN un-completed module (practical kind for uploads; none once complete)', () => {
  expect(deriveCurrentMission(modules, [], practical)).toEqual({
    moduleKey: 'module-02',
    titleTh: 'ท2',
    titleEn: 'M2',
    kind: 'knowledge',
  })
  // module-11 open + practical kind.
  const allOpen = modules.map((m) => ({ ...m, open: true }))
  expect(deriveCurrentMission(allOpen, ['module-01', 'module-02', 'module-08'], practical)).toEqual({
    moduleKey: 'module-11',
    titleTh: 'ท11',
    titleEn: 'M11',
    kind: 'practical',
  })
  // the live module's own row says complete → nothing pending → NO row.
  expect(deriveCurrentMission(allOpen, ['module-11'], practical)).toBeNull()
  expect(deriveCurrentMission([], [], practical)).toBeNull()
})

const round = (over: Partial<HubSubmission> = {}): HubSubmission => ({
  missionId: 'module-08',
  submissionSeq: 1,
  status: 'in_progress',
  reviewVerdict: null,
  reviewNotesTh: null,
  reviewNotesEn: null,
  ...over,
})

test('awaiting review: only the FINAL module latest round `submitted` (approved / earlier modules say no)', () => {
  const allOpen = modules.map((m) => ({ ...m, open: true }))
  expect(deriveAwaitingReview(allOpen, [round({ missionId: 'module-11', status: 'submitted' })])).toEqual({
    moduleKey: 'module-11',
  })
  expect(deriveAwaitingReview(allOpen, [round({ missionId: 'module-11', status: 'approved' })])).toBeNull()
  expect(deriveAwaitingReview(allOpen, [round({ missionId: 'module-08', status: 'submitted' })])).toBeNull()
  // the LATEST round decides: round 1 submitted, round 2 approved → not awaiting.
  expect(
    deriveAwaitingReview(allOpen, [
      round({ missionId: 'module-11', submissionSeq: 1, status: 'submitted' }),
      round({ missionId: 'module-11', submissionSeq: 2, status: 'approved' }),
    ]),
  ).toBeNull()
  expect(deriveAwaitingReview([], [])).toBeNull()
})

test('status rows read REAL rows only: latest round, the notes-bearing feedback round, none when no rows', () => {
  const rows = [
    round({ submissionSeq: 1, status: 'needs_improvement', reviewNotesEn: 'fix the slides' }),
    round({ submissionSeq: 2, status: 'submitted' }),
  ]
  expect(latestSubmission(rows)?.submissionSeq).toBe(2)
  expect(deriveFeedback(rows)?.reviewNotesEn).toBe('fix the slides')
  expect(latestSubmission([])).toBeNull()
  expect(deriveFeedback(rows.map((r) => ({ ...r, reviewNotesTh: null, reviewNotesEn: null })))).toBeNull()
})

test('state lines: the hub prints the SAME statuses the old screen spoke', () => {
  const base = {
    gateStatus: 'ok' as const,
    consent: false,
    override: false,
    pretestSubmitted: false,
    gateOpen: false,
    closeReady: true,
    postUnlocked: false,
    surveySubmitted: false,
    closeError: false,
  }
  expect(deriveNextActionLines({ ...base, gateDetail: 'd' }).map((l) => l.key)).toEqual(['states.noConsent'])
  expect(deriveNextActionLines({ ...base, consent: true, gateDetail: 'd' }).map((l) => l.key)).toEqual(['states.consentNoSubmit'])
  // mid-course: gate open + close locked (the journey's asserted copy).
  expect(
    deriveNextActionLines({ ...base, consent: true, pretestSubmitted: true, gateOpen: true, gateDetail: 'd' }).map((l) => l.key),
  ).toEqual(['states.gateOpen', 'states.closeLocked'])
  // done: closeDone; a gate error speaks its own state line instead.
  expect(
    deriveNextActionLines({ ...base, gateOpen: true, pretestSubmitted: true, consent: true, postUnlocked: true, surveySubmitted: true }).map((l) => l.key),
  ).toEqual(['states.gateOpen', 'states.closeDone'])
  expect(deriveNextActionLines({ ...base, gateStatus: 'unauthorized', gateDetail: 'no session' }).map((l) => l.key)).toEqual(['states.unauthorized'])
})

test('normalizeHubReads applies every default ONCE; deriveHubSummary gates each row on its OWN read', () => {
  const n = normalizeHubReads({
    gate: { status: 'ok' },
    posttest: { status: 'ok' },
    survey: { status: 'ok' },
    map: {},
    rows: { status: 'ok' },
    xp: { status: 'ok' },
  })
  expect(n.gateOk).toBe(true)
  // no own Pre-Test stamp, no override → the gate is closed, no CTA pressure.
  expect(n.gateOpen).toBe(false)
  expect(n.consent).toBe(false)
  expect(n.pretestSubmitted).toBe(false)
  expect(n.modules).toEqual([])
  expect(n.submissions).toEqual([])
  expect(n.completedKeys).toEqual([])
  expect(n.totalModules).toBe(0)
  expect(n.xp).toEqual({ level: 1, totalXp: 0, xpToNext: 100, progressPct: 0 })
  expect(n.badges).toEqual([])
  // summary: an ok XP read renders its row; no map / no badges / no rows → NO rows.
  const s = deriveHubSummary(n)
  expect(s.xp).toEqual(n.xp)
  expect(s.badges).toBeNull()
  expect(s.progress).toBeNull()
  expect(s.mission).toBeNull()
  expect(s.submission).toBeNull()
  expect(s.feedback).toBeNull()
  // not-ok reads gate ONLY their own rows (the zero-fabrication rule).
  const s2 = deriveHubSummary(
    normalizeHubReads({
      gate: { status: 'ok', consent: true, submitted: true },
      posttest: { status: 'error', detail: 'boom' },
      survey: { status: 'ok' },
      map: { modules: [{ module_key: 'module-01', order_index: 1, title_th: 'ท', title_en: 'M', lock_state: 'open' }] },
      rows: { status: 'unauthorized' },
      xp: { status: 'error' },
    }),
  )
  expect(s2.xp).toBeNull()
  expect(s2.progress).toBeNull()
  expect(s2.mission).toBeNull()
  expect(s2.submission).toBeNull()
  expect(s2.feedback).toBeNull()
  // the feedback row's presentation defaults ONCE (never a printed "null").
  expect(
    submissionPresentation(
      round({ reviewVerdict: null, reviewNotesTh: null, reviewNotesEn: 'notes only' }),
      (_th, en) => en,
    ),
  ).toEqual({ verdict: '', notes: 'notes only' })
})

test('the gate/close normalizers pin their defaults (missing flags read as false)', () => {
  expect(normalizeGateReads({ status: 'ok' })).toEqual({
    gateOk: true,
    gateOpen: false,
    gateStatus: 'ok',
    gateDetail: undefined,
    consent: false,
    override: false,
    pretestSubmitted: false,
  })
  // the learner's own stamp (or an audited override) opens the gate.
  expect(normalizeGateReads({ status: 'ok', submitted: true }).gateOpen).toBe(true)
  expect(normalizeGateReads({ status: 'ok', override: true }).gateOpen).toBe(true)
  // the post-test's own detail wins; the survey's is the fallback (next case).
  expect(normalizeCloseReads({ status: 'ok', detail: 'd' }, { status: 'error', detail: 'boom' })).toEqual({
    closeReady: false,
    closeError: true,
    closeDetail: 'd',
    postUnlocked: false,
    postSubmitted: false,
    surveyUnlocked: false,
    surveySubmitted: false,
  })
  // the detail falls through to the survey's own when the post-test has none.
  expect(normalizeCloseReads({ status: 'ok' }, { status: 'ok', detail: 's' }).closeDetail).toBe('s')
})

test('buildHubView turns the six real reads into the rendered model (null = no row)', () => {
  const fresh = buildHubView({
    gate: { status: 'ok', consent: false, submitted: false, detail: 'd' },
    posttest: { status: 'ok', unlocked: false, submitted: false },
    survey: { status: 'ok', unlocked: false, submitted: false },
    map: { modules: [] },
    rows: { status: 'ok', completedModuleKeys: [], practicalModuleKeys: [], submissions: [] },
    xp: { status: 'ok', level: 1, totalXp: 0, xpToNext: 100, progressPct: 0, badges: [] },
  })
  expect(fresh.cta?.labelKey).toBe('nextActionExplanation')
  expect(fresh.lines.map((l) => l.key)).toEqual(['states.noConsent'])
  // no rows, no map, no badges → NO summary rows (never a fake zero).
  expect(fresh.badges).toBeNull()
  expect(fresh.mission).toBeNull()
  expect(fresh.submission).toBeNull()
  expect(fresh.feedback).toBeNull()
  // a rows read that is NOT ok kills every summary row but never crashes.
  const denied = buildHubView({
    gate: { status: 'ok', consent: true, submitted: true },
    posttest: { status: 'ok', unlocked: false },
    survey: { status: 'ok', unlocked: false },
    map: { modules: [{ module_key: 'module-01', order_index: 1, title_th: 'ท', title_en: 'M', lock_state: 'open' }] },
    rows: { status: 'unauthorized' },
    xp: { status: 'unauthorized' },
  })
  expect(denied.xp).toBeNull()
  expect(denied.progress).toBeNull()
  expect(denied.mission).toBeNull()
  expect(denied.submission).toBeNull()
  expect(denied.cta?.href).toBe('/course')
  // the awaiting-review FINAL round flows through: review CTA + real rows.
  const awaiting = buildHubView({
    gate: { status: 'ok', consent: true, submitted: true },
    posttest: { status: 'ok', unlocked: false },
    survey: { status: 'ok', unlocked: false },
    map: {
      modules: [
        { module_key: 'module-01', order_index: 1, title_th: 'ท', title_en: 'M', lock_state: 'open' },
        { module_key: 'module-11', order_index: 11, title_th: 'ท11', title_en: 'F', lock_state: 'open' },
      ],
    },
    rows: {
      status: 'ok',
      completedModuleKeys: ['module-01'],
      practicalModuleKeys: ['module-11'],
      submissions: [{ mission_id: 'module-11', submission_seq: 1, status: 'submitted', review_verdict: null, review_notes_th: null, review_notes_en: null }],
    },
    xp: { status: 'ok', level: 3, totalXp: 250, xpToNext: 50, progressPct: 50, badges: [{ badge_key: 'first_steps', label_th: 'ขั้แรก', label_en: 'First Steps' }] },
  })
  expect(awaiting.cta).toEqual({ href: { reviewModuleKey: 'module-11' }, labelKey: 'linkReviewStatus' })
  expect(awaiting.badges?.[0]?.badge_key).toBe('first_steps')
  expect(awaiting.submission?.missionId).toBe('module-11')
  expect(awaiting.feedback).toBeNull()
})

test('the hub page renders ONE primary CTA, tokens only, and reads the hub via the server read', () => {
  const src = fs.readFileSync('app/[locale]/page.tsx', 'utf8')
  // exactly one primary-CTA affordance in the source (the AC's "exactly one").
  expect(src.match(/data-ppg-cta="primary"/g)?.length).toBe(1)
  // no ad-hoc colours — every colour resolves a `--ppg-*` token.
  expect(src).not.toMatch(/#[0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F][0-9a-fA-F]/)
  // the reads module is server-only and never touches the service-role key.
  const hub = fs.readFileSync('lib/sup/hub.ts', 'utf8')
  expect(hub).toContain("import 'server-only'")
  expect(hub).not.toMatch(/SERVICE_ROLE/i)
})

test('the hub V3 framing (PPGA #52): the ONE CTA rides the .ppg-cta face and the status rows are real-data cards', () => {
  const src = fs.readFileSync('app/[locale]/page.tsx', 'utf8')
  // the single primary action carries the V3 CTA face (the gallery's btn-p).
  expect(src).toContain('className="ppg-cta" data-ppg-cta="primary"')
  // the real-status slots are the gallery's cards: the gold XP panel + the
  // white strip-cards (course progress / badges / mission / submission /
  // feedback) — every row keeps its null-guard (a missing datum renders NO
  // card: zero fabricated data).
  expect(src).toContain('ppg-xp-panel')
  expect(src.match(/ppg-status-card/g)?.length).toBeGreaterThanOrEqual(5)
  expect(src.match(/if \(!\w+\) return null/g)?.length).toBeGreaterThanOrEqual(6)
  // the earned badge's observable stays inside the status region (the
  // #51 chip-only HUD moved the award row here — the `data-ppg-badge` seam).
  expect(src).toContain('data-ppg-badge={b.badge_key}')
  // the summary rides the REAL reads; no client-side fetch.
  expect(src).toContain('readHubRowsViaTables')
  expect(src).toContain('readXpSummaryViaRpc')
  expect(src).not.toContain('fetch(')
})

test('the hub copy exists in BOTH locales (bilingual complete, no raw keys)', () => {
  for (const locale of ['en', 'th']) {
    const msgs = JSON.parse(fs.readFileSync(`messages/${locale}.json`, 'utf8')) as Record<string, Record<string, unknown>>
    const home = msgs.home as Record<string, unknown>
    const states = home.states as Record<string, unknown>
    for (const key of ['linkReviewStatus', 'statusLabel', 'courseProgress', 'missionCurrent', 'submissionLabel', 'feedbackLabel']) {
      expect(typeof home[key], `${locale} home.${key}`).toBe('string')
    }
    for (const key of ['inProgress', 'submitted', 'needsImprovement', 'approved']) {
      expect(typeof states[key], `${locale} home.states.${key}`).toBe('string')
    }
  }
})
