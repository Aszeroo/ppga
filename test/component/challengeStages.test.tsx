/**
 * @vit-environment jsdom
 */
import { vi } from 'vitest'

// The challenge primitives render the routing's `Link` (a Client-Component
// affordance) — the design-system harness's inert navigation stubs, the same
// pattern `designSystem.test.tsx` ships (the tests never navigate for real).
vi.mock('next/navigation', () => ({
  useRouter: () => ({ replace: () => undefined }),
  usePathname: () => undefined,
  redirect: () => undefined,
  permanentRedirect: () => undefined,
}) as never)

import { render, cleanup } from '@testing-library/react'
import { NextIntlClientProvider } from 'next-intl'
import { afterEach, test, expect } from 'vitest'

afterEach(() => cleanup())

import enMessages from '../../messages/en.json'

import {
  buildChallengeContext,
  buildChallengeSteps,
  buildUnlockBand,
  challengePanelView,
  challengeStepHref,
  challengeTrackSteps,
  deriveCurrentStep,
  deriveUnlockFeedback,
  ledgerEvent,
  ledgerEventAttr,
  missionPanelState,
  moduleRewardEvent,
  ownLedgerEvents,
  passedLessonKeys,
  rewardChipProps,
  type ChallengeReadInput,
  type LedgerEventRow,
  type MapLockRow,
} from '../../lib/challengeStages'
import { ChallengeTrack } from '../../components/ChallengeTrack'
import { MissionPanel } from '../../components/MissionPanel'
import { SelfCheckPanel } from '../../components/SelfCheckPanel'
import { XpRewardChip } from '../../components/XpRewardChip'

/**
 * Ticket #45 (#41 stage 4) challenge framing: the PURE model (the states the
 * reads speak — checks cleared ONLY by the learner's own ledger events, the
 * Mission locked/open per the availability read, cleared by the OWN complete
 * row; the panel `challenge | success | clear`; the unlock ONLY from the
 * DATABASE's own next-module `open`; the ledger's own rows ARE the XP
 * display — the teacher/admin RLS overlap filtered in JS) + the primitives'
 * accessible render (stage vocabulary: cleared marks, copy chips, the locked
 * step's stripes + `aria-disabled` + NO link, the reward chip's PK marker).
 */

const ME = 'aaaaaaaa-0000-0000-0000-000000000001'
const OTHER = 'bbbbbbbb-0000-0000-0000-000000000002'

const row = (
  learner_id: string,
  event_type: string,
  event_ref: string,
  amount: number,
): LedgerEventRow => ({ learner_id, event_type, event_ref, amount })

test('ownLedgerEvents: a teacher/admin RLS overlap NEVER shows a stranger grant', () => {
  const rows = [
    row(ME, 'self_check_pass', 'module-01-lesson-01', 50),
    row(OTHER, 'knowledge_mission_pass', 'module-01', 100),
  ]
  const own = ownLedgerEvents({ status: 'ok', uid: ME, rows })
  expect(own).toHaveLength(1)
  expect(own[0].event_ref).toBe('module-01-lesson-01')
  // a failed read degrades to NOTHING (no fake rows, no crash).
  expect(ownLedgerEvents({ status: 'error', detail: 'boom' })).toEqual([])
})

test('ledger lookups: the PK row is the grant record (attr, lessons, module reward)', () => {
  const own = [
    row(ME, 'self_check_pass', 'module-02-lesson-01', 50),
    row(ME, 'knowledge_mission_pass', 'module-02', 100),
    row(ME, 'practical_approval', 'module-08', 150),
    row(ME, 'final_project', 'module-11', 300),
  ]
  expect(ledgerEventAttr(own[0])).toBe('self_check_pass:module-02-lesson-01')
  expect(ledgerEvent(own, 'practical_approval', 'module-08')?.amount).toBe(150)
  expect(ledgerEvent(own, 'practical_approval', 'module-09')).toBeNull()
  expect(passedLessonKeys(own)).toEqual(['module-02-lesson-01'])
  expect(moduleRewardEvent(own, 'knowledge', 'module-02')?.amount).toBe(100)
  expect(moduleRewardEvent(own, 'practical', 'module-08')?.amount).toBe(150)
  // the Final Project is the ledger's OWN type — the practical lookup speaks it.
  expect(moduleRewardEvent(own, 'practical', 'module-11')?.amount).toBe(300)
})

const baseInput = {
  lessonsVisible: true,
  visibleLessonKeys: ['module-01-lesson-01', 'module-01-lesson-02'],
  ownPassedCheckKeys: [] as string[],
  missionKind: 'knowledge' as const,
  missionAvailable: false,
  completed: false,
  rewardEventExists: false,
  submissionExists: false,
  approved: false,
}

test('buildChallengeSteps: states ride the reads — checks, gate, completion', () => {
  const fresh = buildChallengeSteps(baseInput)
  expect(fresh.map((s) => s.state)).toEqual(['open', 'open', 'locked', 'locked'])
  // the frontier is the first OPEN step; the check target is the first UNPASSED lesson.
  expect(deriveCurrentStep(fresh)?.key).toBe('lesson')
  expect(fresh[1].checkTargetLessonKey).toBe('module-01-lesson-01')

  const halfChecked = buildChallengeSteps({ ...baseInput, ownPassedCheckKeys: ['module-01-lesson-01'], missionAvailable: true })
  expect(halfChecked[1].state).toBe('open')
  expect(halfChecked[1].checkTargetLessonKey).toBe('module-01-lesson-02')
  // the frontier stays the LESSON step: a Lesson has no clearing authority,
  // so while its content is visible it is the sequence's first OPEN step.
  expect(deriveCurrentStep(halfChecked)?.key).toBe('lesson')

  const gateInput = {
    ...baseInput,
    ownPassedCheckKeys: ['module-01-lesson-01', 'module-01-lesson-02'],
    missionAvailable: true,
  }
  const gateOpen = buildChallengeSteps(gateInput)
  expect(gateOpen.map((s) => s.state)).toEqual(['open', 'cleared', 'open', 'open'])

  const clearedKnowledge = buildChallengeSteps({
    ...gateInput,
    completed: true,
    rewardEventExists: true,
  })
  expect(clearedKnowledge.map((s) => s.state)).toEqual(['open', 'cleared', 'cleared', 'cleared'])
  // even fully cleared, the visible LESSON step stays the first OPEN step
  // (it has no clearing authority) — the null frontier belongs to the
  // locked road below, never to a cleared-but-readable Module.
  expect(deriveCurrentStep(clearedKnowledge)?.key).toBe('lesson')

  // a locked module read locks the whole road (never a hidden, never a fake).
  const lockedModule = buildChallengeSteps({ ...baseInput, lessonsVisible: false, visibleLessonKeys: [] })
  expect(lockedModule.map((s) => s.state)).toEqual(['locked', 'locked', 'locked', 'locked'])
})

test('buildChallengeSteps: the practical Result opens with a real round, clears with the approval', () => {
  const practical = { ...baseInput, missionKind: 'practical' as const, missionAvailable: true }
  expect(buildChallengeSteps(practical)[3].state).toBe('locked')

  const pending = buildChallengeSteps({ ...practical, submissionExists: true })
  expect(pending[3].state).toBe('open')
  // needs_improvement rides here: a REAL round, NO grant — not cleared.
  expect(buildChallengeSteps({ ...practical, submissionExists: true, completed: false })[2].state).toBe('open')

  // the approved round the REAL journey stands on: checks passed, a round
  // submitted, the approval + completion landed — the road clears end-to-end.
  const approved = buildChallengeSteps({
    ...practical,
    ownPassedCheckKeys: ['module-01-lesson-01', 'module-01-lesson-02'],
    submissionExists: true,
    approved: true,
    completed: true,
  })
  expect(approved.map((s) => s.state)).toEqual(['open', 'cleared', 'cleared', 'cleared'])
})

test('missionPanelState: the real signals decide — nothing attemptable renders NO panel', () => {
  expect(missionPanelState({ available: true, rewardEventExists: false, completed: false })).toBe('challenge')
  expect(missionPanelState({ available: true, rewardEventExists: true, completed: false })).toBe('success')
  expect(missionPanelState({ available: true, rewardEventExists: true, completed: true })).toBe('clear')
  expect(missionPanelState({ available: false, rewardEventExists: false, completed: false })).toBeNull()
})

test('deriveUnlockFeedback: only the DATABASE-opened next Module feeds the band', () => {
  const next: MapLockRow = { module_key: 'module-02', order_index: 2, lock_state: 'open', title_th: 'สไลด', title_en: 'Slides' }
  const lockedNext: MapLockRow = { ...next, lock_state: 'locked' }
  expect(deriveUnlockFeedback(true, next)?.module_key).toBe('module-02')
  // no completion -> NO band; a still-locked next -> NO band; no next -> NO band.
  expect(deriveUnlockFeedback(false, next)).toBeNull()
  expect(deriveUnlockFeedback(true, lockedNext)).toBeNull()
  expect(deriveUnlockFeedback(true, null)).toBeNull()
})

test('buildUnlockBand: the label rides the map title, the route the real module key', () => {
  const row = { module_key: 'module-02', order_index: 2, lock_state: 'open' as const, title_th: 'สไลด และ เลย아웃', title_en: 'Slides & layouts' }
  const en = buildUnlockBand({ unlockedRow: row }, 'unlocked-copy', 'en')
  expect(en?.title).toBe('02. Slides & layouts')
  expect(en?.href).toEqual({ pathname: '/course/[moduleKey]', params: { moduleKey: 'module-02' } })
  expect(buildUnlockBand({ unlockedRow: null }, 'unlocked-copy', 'en')).toBeNull()
})

const cleanReads: ChallengeReadInput = {
  lessons: { status: 'ok', lessons: [{ lesson_key: 'module-01-lesson-01' }, { lesson_key: 'module-01-lesson-02' }] },
  ledger: { status: 'ok', uid: ME, rows: [] },
  completed: { status: 'ok', uid: ME, rows: [] },
  kinds: { status: 'ok', keys: ['module-08', 'module-09', 'module-10', 'module-11'] },
  availability: { status: 'empty' },
  map: { status: 'ok', modules: [{ module_key: 'module-01', order_index: 1, lock_state: 'open' }] },
}

test('buildChallengeContext: teacher rows never grant, kinds speak, unlocks stay honest', () => {
  const ctx = buildChallengeContext('module-01', {
    ...cleanReads,
    ledger: {
      status: 'ok',
      uid: ME,
      rows: [
        row(OTHER, 'knowledge_mission_pass', 'module-01', 100),
        row(ME, 'self_check_pass', 'module-01-lesson-01', 50),
      ],
    },
    completed: { status: 'ok', uid: ME, rows: [{ module_key: 'module-01', learner_id: OTHER }] },
    availability: { status: 'ok' },
    map: {
      status: 'ok',
      modules: [
        { module_key: 'module-01', order_index: 1, lock_state: 'open' },
        { module_key: 'module-02', order_index: 2, lock_state: 'open' },
      ],
    },
  })
  // the stranger's grant/complete rows are invisible to ME: challenge, not clear.
  expect(ctx.completed).toBe(false)
  expect(ctx.reward).toBeNull()
  expect(ctx.passed).toEqual(['module-01-lesson-01'])
  expect(ctx.kind).toBe('knowledge')
  expect(ctx.unlockedRow).toBeNull()

  const cleared = buildChallengeContext('module-08', {
    ...cleanReads,
    lessons: { status: 'ok', lessons: [{ lesson_key: 'module-08-lesson-04' }] },
    ledger: { status: 'ok', uid: ME, rows: [row(ME, 'practical_approval', 'module-08', 150)] },
    completed: { status: 'ok', uid: ME, rows: [{ module_key: 'module-08', learner_id: ME }] },
    availability: { status: 'ok' },
    map: {
      status: 'ok',
      modules: [{ module_key: 'module-08', order_index: 8, lock_state: 'open' }],
    },
  })
  expect(cleared.kind).toBe('practical')
  expect(cleared.reward?.amount).toBe(150)
  // module-09 is NOT in the caller's map read -> NO unlock band (never invented).
  expect(cleared.unlockedRow).toBeNull()
  // a degraded ledger read (denied) shows ZERO grants, never a fake.
  const deniedLedger = buildChallengeContext('module-01', {
    ...cleanReads,
    ledger: { status: 'denied', detail: 'nope' },
  })
  expect(deniedLedger.reward).toBeNull()
  expect(deniedLedger.passed).toEqual([])
})

test('challengeTrackSteps + rewardChipProps: the shared composition every module page renders', () => {
  const ctx = buildChallengeContext('module-01', {
    ...cleanReads,
    ledger: { status: 'ok', uid: ME, rows: [row(ME, 'knowledge_mission_pass', 'module-01', 100)] },
    availability: { status: 'ok' },
  })
  const copy = {
    title: (key: string) => `title:${key}`,
    state: (state: string) => `state:${state}`,
    current: 'now',
  }
  const full = challengeTrackSteps(ctx, 'module-01', copy)
  expect(full.map((s) => s.key)).toEqual(['lesson', 'selfcheck', 'mission', 'result'])
  // no own self_check_pass rows: the checks stay OPEN; availability opens
  // the Mission; the real reward row clears the Result.
  expect(full.map((s) => s.stateCopy)).toEqual(['state:open', 'state:open', 'state:open', 'state:cleared'])
  expect(full[0].title).toBe('title:lesson')
  expect(full[0].href).toEqual({
    pathname: '/course/[moduleKey]/[lessonKey]',
    params: { moduleKey: 'module-01', lessonKey: 'module-01-lesson-01' },
  })
  // the Lesson page trims the sequence to its three steps…
  expect(challengeTrackSteps(ctx, 'module-01', copy, { limit: 3 })).toHaveLength(3)
  // …and the Result page unlinks its own step.
  expect(
    challengeTrackSteps(ctx, 'module-01', copy, { unlinkedStep: 'result' })[3].href,
  ).toBeUndefined()
  // the chip props ride the REAL row only — nothing granted, nothing shown.
  expect(rewardChipProps(ctx, 'ledger:')).toEqual({
    amount: 100,
    eventAttr: 'knowledge_mission_pass:module-01',
    label: 'ledger:',
  })
  expect(rewardChipProps({ reward: null }, 'ledger:')).toBeNull()
})

test('challengePanelView: denial renders NO panel, a real grant clears — the shared composition', () => {
  const ctx = buildChallengeContext('module-01', {
    ...cleanReads,
    ledger: { status: 'ok', uid: ME, rows: [row(ME, 'knowledge_mission_pass', 'module-01', 100)] },
    completed: { status: 'ok', uid: ME, rows: [{ module_key: 'module-01', learner_id: ME }] },
    availability: { status: 'ok' },
  })
  const copy = {
    stateCopy: (s: string) => `copy:${s}`,
    rewardNote: 'ledger:',
    unlockNext: 'unlocked',
  }
  const clear = challengePanelView(ctx, { status: 'ok', hasContent: true }, copy, 'en')
  expect(clear.panel).toBe('clear')
  expect(clear.stateCopy).toBe('copy:clear')
  expect(clear.cleared).toBe(true)
  expect(clear.reward?.amount).toBe(100)
  // a SERVER-denied read renders NO panel, however rich the ledger (never
  // a framing the availability read does not support).
  const denied = challengePanelView(ctx, { status: 'empty', hasContent: false }, copy, 'en')
  expect(denied.panel).toBeNull()
  // attemptable, nothing granted yet: the CHALLENGE state, no chip, no
  // cleared note — the shipped rule note stays the page's own.
  const challenge = challengePanelView({ ...ctx, reward: null, completed: false }, { status: 'ok', hasContent: true }, copy, 'en')
  expect(challenge.panel).toBe('challenge')
  expect(challenge.reward).toBeNull()
  expect(challenge.cleared).toBe(false)
})

test('challengeStepHref: locked steps never link; the routes ride the module kind', () => {
  const ctx = { kind: 'practical' as const, visibleLessonKeys: ['module-08-lesson-01'] }
  expect(challengeStepHref({ key: 'mission', orderIndex: 3, state: 'locked' }, 'module-08', ctx)).toBeUndefined()
  expect(
    challengeStepHref({ key: 'mission', orderIndex: 3, state: 'open' }, 'module-08', ctx),
  ).toEqual({ pathname: '/course/[moduleKey]/practical', params: { moduleKey: 'module-08' } })
  expect(
    challengeStepHref({ key: 'result', orderIndex: 4, state: 'cleared' }, 'module-08', ctx),
  ).toEqual({ pathname: '/course/[moduleKey]/review', params: { moduleKey: 'module-08' } })
  expect(
    challengeStepHref({ key: 'selfcheck', orderIndex: 2, state: 'open', checkTargetLessonKey: 'module-08-lesson-02' }, 'module-08', ctx),
  ).toEqual({ pathname: '/course/[moduleKey]/[lessonKey]', params: { moduleKey: 'module-08', lessonKey: 'module-08-lesson-02' } })
})

test('ChallengeTrack renders the stage vocabulary: cleared marks, current chip, a locked no-link step', () => {
  const { container } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ChallengeTrack
        label="Challenge sequence"
        steps={[
          { key: 'lesson', orderIndex: 1, title: 'Lesson', stateCopy: 'cleared-copy', state: 'cleared', href: '/course' },
          { key: 'selfcheck', orderIndex: 2, title: 'Self-Check', stateCopy: 'open-copy', state: 'open', isCurrent: true, currentCopy: 'current-copy', href: '/course' },
          { key: 'mission', orderIndex: 3, title: 'Mission', stateCopy: 'locked-copy', state: 'locked' },
        ]}
      />
    </NextIntlClientProvider>,
  )
  const list = container.querySelector('ol.ppg-stage-map.ppg-challenge-track')
  expect(list?.getAttribute('aria-label')).toBe('Challenge sequence')
  expect(list?.getAttribute('data-ppg-challenge-track')).toBe('true')
  const items = Array.from(container.querySelectorAll('.ppg-stage-item'))
  expect(items).toHaveLength(3)
  expect(
    items.map((li) => li.querySelector('[data-ppg-challenge-step]')?.getAttribute('data-ppg-challenge-step')),
  ).toEqual(['lesson', 'selfcheck', 'mission'])

  const cleared = items[0].querySelector('.ppg-stage-node') as HTMLElement
  expect(cleared.getAttribute('data-ppg-stage-state')).toBe('cleared')
  expect(cleared.querySelector('.ppg-stage-clear-mark')).toBeTruthy()
  expect(cleared.getAttribute('aria-label')).toContain('cleared-copy')

  const frontier = items[1].querySelector('.ppg-stage-node') as HTMLElement
  expect(frontier.getAttribute('data-ppg-stage-current')).toBe('true')
  expect(frontier.textContent).toContain('current-copy')
  expect(frontier.querySelector('a.ppg-stage-link')).toBeTruthy()

  const locked = items[2].querySelector('.ppg-stage-node') as HTMLElement
  expect(locked.getAttribute('aria-disabled')).toBe('true')
  expect(locked.className).toContain('ppg-state-locked')
  expect(locked.getAttribute('aria-label')).toContain('locked-copy')
  expect(locked.querySelector('a')).toBeNull()
  expect(items[0].querySelector('.ppg-stage-connector')).toBeNull()
  expect(items[2].querySelector('.ppg-stage-connector')).toBeTruthy()

  // #52 V3 dressing: the road is CSS-owned (the shared `.ppg-stage-map` rule
  // carries the list reset, the shared `.ppg-stage-numeral` the gold tile —
  // no inline overrides that could diverge from the Course Map's road), the
  // chips carry the gallery icon BESIDE the copy (state never icon-only nor
  // hue-only), and the locked step keeps `backgroundImage: undefined` in its
  // inline style — an inline gradient would erase the `.ppg-state-locked`
  // stripe (a background-image) and silently kill the locked cue.
  const road = list as HTMLElement
  expect(road.getAttribute('style')).toBeNull()
  const clearedNumeral = cleared.querySelector('.ppg-stage-numeral') as HTMLElement
  expect(clearedNumeral.getAttribute('style')).toBeNull()
  const clearedChip = cleared.querySelector('.ppg-stage-state-chip') as HTMLElement
  expect(clearedChip.querySelector('span[aria-hidden="true"]')?.textContent).toBe('✓ ')
  expect(clearedChip.textContent).toContain('cleared-copy')
  // (The inline-style serialization is read off the attribute so the var()
  // forms survive jsdom; what matters is WHICH declarations the shared
  // style function emits, not its whitespace.)
  expect(cleared.getAttribute('style')).toMatch(/background-image:\s*linear-gradient\(135deg,\s*var\(--ppg-mint-tint\),\s*var\(--ppg-bg-surface\)\)/)
  expect(locked.getAttribute('style')).not.toContain('background-image')
  expect(locked.getAttribute('style')).toMatch(/background-color:\s*var\(--ppg-state-locked-bg\)/)
})

test('MissionPanel frames the three states: chip + PK-marked reward + the real unlock band', () => {
  const { container, rerender } = render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <MissionPanel state="challenge" stateCopy="challenge-copy" heading="Knowledge Mission" panelLabel="panel">
        <p>form</p>
      </MissionPanel>
    </NextIntlClientProvider>,
  )
  const panel = container.querySelector('[data-ppg-mission-panel]') as HTMLElement
  expect(panel.getAttribute('data-ppg-mission-panel')).toBe('challenge')
  expect(panel.querySelector('[data-ppg-mission-state]')?.textContent).toBe('challenge-copy')
  // challenge: NO reward chip, NO unlock band — nothing was granted, nothing opened.
  expect(panel.querySelector('[data-ppg-xp-event]')).toBeNull()
  expect(panel.querySelector('[data-ppg-unlock]')).toBeNull()

  rerender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <MissionPanel
        state="clear"
        stateCopy="clear-copy"
        heading="Knowledge Mission"
        panelLabel="panel"
        reward={{ amount: 100, eventAttr: 'knowledge_mission_pass:module-01', label: 'From your XP ledger:' }}
        unlocked={{ copy: 'unlocked-copy', title: '02. Slides', href: '/course' }}
      >
        <p>form</p>
      </MissionPanel>
    </NextIntlClientProvider>,
  )
  const clearedPanel = container.querySelector('[data-ppg-mission-panel]') as HTMLElement
  expect(clearedPanel.getAttribute('data-ppg-mission-panel')).toBe('clear')
  const chip = clearedPanel.querySelector('[data-ppg-xp-event]') as HTMLElement
  expect(chip.getAttribute('data-ppg-xp-event')).toBe('knowledge_mission_pass:module-01')
  expect(chip.textContent).toContain('+100 XP')
  const band = clearedPanel.querySelector('[data-ppg-unlock="next-module"]') as HTMLElement
  expect(band.textContent).toContain('unlocked-copy')
  expect(band.querySelector('a')).toBeTruthy()
  // #52: the band's link wears the `.ppg-link` TEXT face (content, not a
  // competing CTA — the panel's ONE primary action stays its own form).
  expect(band.querySelector('a.ppg-link')).toBeTruthy()
  expect(band.querySelector('a.ppg-cta')).toBeNull()
})

test('XpRewardChip is the ledger row made visible: the PK marker + the real amount', () => {
  const { container } = render(
    <XpRewardChip amount={50} eventAttr="self_check_pass:module-01-lesson-01" label="Ledger:" />,
  )
  const chip = container.querySelector('[data-ppg-xp-event]') as HTMLElement
  expect(chip.getAttribute('data-ppg-xp-event')).toBe('self_check_pass:module-01-lesson-01')
  expect(chip.textContent).toContain('+50 XP')
  expect(chip.textContent).toContain('Ledger:')
})

const SC_ROWS = [
  { orderIndex: 1, optionKey: 'a', stem: 'Where is the New button?', option: 'On the Home tab' },
  { orderIndex: 1, optionKey: 'b', stem: 'Where is the New button?', option: 'On the File tab' },
  { orderIndex: 2, optionKey: 'a', stem: 'The first step is…', option: 'Opening the app' },
]

const scPanel = (props: {
  outcome: 'correct' | 'retry'
  reward?: { amount: number; eventAttr: string; label: string } | null
}) => render(
  <NextIntlClientProvider locale="en" messages={enMessages}>
    <SelfCheckPanel
      lessonKey="module-01-lesson-01"
      rows={SC_ROWS}
      sectionLabel="Self-Check"
      submitLabel="Check my answers (unlimited retries)"
      outcome={props.outcome}
      outcomeCopy="Pass (+50 XP — granted exactly once, the first pass only)"
      retryCopy="Retry freely — the pass gates the Mission, no grade is ever recorded."
      reward={props.reward ?? null}
      badgeNote="First Steps badge awarded on the first pass"
    />
  </NextIntlClientProvider>,
)

test('SelfCheckPanel keeps the SERVER-graded form intact: grouped stems, letter tiles, one primary CTA', async () => {
  const { container } = scPanel({ outcome: 'retry' })
  const panel = container.querySelector('.ppg-sc-panel') as HTMLElement
  expect(panel.getAttribute('aria-label')).toBe('Self-Check')

  // The shipped native POST form, field for field (the #52 V3 dressing is
  // presentation: the API route, the answer_<order> names, the option-value
  // radios and the hidden lesson_key all survive untouched).
  const form = container.querySelector('form') as HTMLFormElement
  expect(form.getAttribute('method')).toBe('POST')
  expect(form.getAttribute('action')).toBe('/api/self-check/submit')
  expect(form.getAttribute('data-ppg-self-check-form')).toBe('selfcheck')
  const lessonKey = form.querySelector('input[name="lesson_key"]') as HTMLInputElement
  expect(lessonKey.value).toBe('module-01-lesson-01')
  const radios = Array.from(form.querySelectorAll('input[type="radio"]')) as HTMLInputElement[]
  expect(radios.map((r) => r.id)).toEqual(['answer_1_a', 'answer_1_b', 'answer_2_a'])
  expect(radios.map((r) => r.getAttribute('name'))).toEqual(['answer_1', 'answer_1', 'answer_2'])
  expect(radios.map((r) => r.value)).toEqual(['a', 'b', 'a'])
  expect(form.querySelector('button[type="submit"]')).toBeTruthy()

  // STATE 1 + 2 of 4: the option ROWS wear the gallery's lettered face, and
  // the SELECTED state is the radio's OWN `:checked` painted in CSS (no JS,
  // no new state) — both the row hook and the stylesheet rule are asserted.
  const options = Array.from(container.querySelectorAll('.ppg-sc-opt'))
  expect(options).toHaveLength(3)
  expect(options[0].querySelector('.ppg-sc-opt-letter')?.textContent).toBe('A')
  expect(options[1].querySelector('.ppg-sc-opt-letter')?.textContent).toBe('B')
  const css = (await import('node:fs')).readFileSync('app/globals.css', 'utf8')
  expect(css).toMatch(/\.ppg-sc-opt:has\(input:checked\)/)

  // The RPC repeats the stem per option row; the reader shows it ONCE.
  expect(container.querySelectorAll('.ppg-sc-question')).toHaveLength(2)
  expect(Array.from(container.querySelectorAll('.ppg-sc-question'))
    .filter((p) => p.textContent?.includes('Where is the New button?'))).toHaveLength(1)

  // ONE primary CTA per context.
  const ctas = container.querySelectorAll('.ppg-cta[data-ppg-cta="primary"]')
  expect(ctas).toHaveLength(1)
  expect(ctas[0].tagName.toLowerCase()).toBe('button')
})

test('SelfCheckPanel states 3 + 4: the mint CORRECT card over the REAL ledger row; the retry card encourages, never punishes', () => {
  const { container, rerender } = scPanel({
    outcome: 'correct',
    reward: { amount: 50, eventAttr: 'self_check_pass:module-01-lesson-01', label: 'From your XP ledger:' },
  })
  const okCard = container.querySelector('[data-ppg-sc-result="correct"]') as HTMLElement
  expect(okCard).toBeTruthy()
  expect(okCard.className).toContain('ppg-sc-result')
  expect(container.querySelector('[data-ppg-sc-result="retry"]')).toBeNull()
  // The real grant rides the card: the ledger PK marker + its own amount —
  // and no success pill coexists with the rendered grant (the #45 gate).
  const chip = okCard.querySelector('[data-ppg-xp-event]') as HTMLElement
  expect(chip.getAttribute('data-ppg-xp-event')).toBe('self_check_pass:module-01-lesson-01')
  expect(chip.textContent).toContain('+50 XP')
  expect(container.querySelector('.ppg-status-pill')).toBeNull()

  rerender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <SelfCheckPanel
        lessonKey="module-01-lesson-01"
        rows={SC_ROWS}
        sectionLabel="Self-Check"
        submitLabel="Check my answers (unlimited retries)"
        outcome="retry"
        outcomeCopy="Pass (+50 XP — granted exactly once, the first pass only)"
        retryCopy="Retry freely — the pass gates the Mission, no grade is ever recorded."
        reward={null}
        badgeNote="First Steps badge awarded on the first pass"
      />
    </NextIntlClientProvider>,
  )
  const retryCard = container.querySelector('[data-ppg-sc-result="retry"]') as HTMLElement
  expect(retryCard).toBeTruthy()
  expect(container.querySelector('[data-ppg-sc-result="correct"]')).toBeNull()
  // No ledger row, no chip — a not-yet-passed panel claims NO grant…
  expect(container.querySelector('[data-ppg-xp-event]')).toBeNull()
  // …and the framing is the encouraging one: trying again freely, nothing
  // lost, no grade recorded (the brief's ban on XP deduction / punishment
  // language — the card carries no minus sign, no lost point, no penalty).
  expect(retryCard.textContent).toContain('Retry freely')
  expect(retryCard.textContent).toContain('no grade is ever recorded')
  expect(retryCard.textContent).not.toMatch(/-50|-10|lost|penalt|deduct|Points/i)
})
