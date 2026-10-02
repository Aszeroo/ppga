import { test, expect } from 'vitest'

import fs from 'node:fs'

import {
  buildStageMapView,
  deriveNextStage,
  deriveStages,
  ownCompletedModuleKeys,
  type StageMapRow,
} from '../../lib/courseStages'

/**
 * Ticket #44 (#41 stage 3) unit tests: the PURE stage-map model — the merge
 * of the `ppg_course_map` rows (the rule's `open|locked`) + the learner's OWN
 * `complete` Mission rows (the cleared authority the same rule reads) into
 * the ordered `cleared | open | locked` list + the real next-stage frontier.
 * The DATABASE decides every state; these tests pin that the model only
 * NAMES what the reads say — never invents a clear, never hides a row, never
 * points the map at a locked stage.
 */

const row = (n: number, lock: 'open' | 'locked'): StageMapRow => ({
  module_key: `module-${String(n).padStart(2, '0')}`,
  order_index: n,
  title_th: `โมดูล ${n}`,
  title_en: `Module ${n}`,
  summary_th: `สรุป ${n}`,
  summary_en: `Summary ${n}`,
  lock_state: lock,
})

const rows = [row(1, 'open'), row(2, 'open'), row(3, 'locked'), row(4, 'locked')]

test('deriveStages: order by order_index, cleared rides the own completions', () => {
  const stages = deriveStages(rows, ['module-01'])
  expect(stages.map((s) => s.order_index)).toEqual([1, 2, 3, 4])
  expect(stages.map((s) => s.state)).toEqual(['cleared', 'open', 'locked', 'locked'])
})

test('deriveStages: input order never matters, an unseen completion is ignored', () => {
  const shuffled = [rows[3], rows[0], rows[3], rows[1], rows[2]]
  const stages = deriveStages(shuffled.filter((r, i, a) => a.indexOf(r) === i), ['module-99'])
  expect(stages.map((s) => s.order_index)).toEqual([1, 2, 3, 4])
  // module-99 is not on the map: no phantom stage, nothing pretends cleared.
  expect(stages.every((s) => s.state !== 'cleared')).toBe(true)
})

test('deriveNextStage: the first OPEN stage is the frontier; cleared/locked never point it', () => {
  expect(deriveNextStage(deriveStages(rows, ['module-01']))?.module_key).toBe('module-02')
  // Nothing open (fresh, gate denied style): no direction, never a locked pointer.
  expect(deriveNextStage(deriveStages([row(1, 'locked')], []))).toBeNull()
  // Everything cleared: the course has no next stage to point at.
  expect(deriveNextStage(deriveStages([row(1, 'open')], ['module-01']))).toBeNull()
})

test('buildStageMapView: ok merge counts cleared + total + keeps the frontier', () => {
  const view = buildStageMapView(
    { status: 'ok', modules: rows },
    { status: 'ok', uid: 'u1', rows: [{ module_key: 'module-01', learner_id: 'u1' }] },
  )
  expect(view).toMatchObject({ status: 'ok', cleared: 1, total: 4 })
  expect(view.next?.module_key).toBe('module-02')
})

test('buildStageMapView: a teacher/admin read clears NOTHING (no learner context)', () => {
  // A teacher's policy sees EVERY learner's rows — none of them carry the
  // teacher's uid, so the map shows the rule's open/locked only.
  const view = buildStageMapView(
    { status: 'ok', modules: rows },
    { status: 'ok', uid: 'teacher-uid', rows: [{ module_key: 'module-01', learner_id: 'learner-uid' }] },
  )
  expect(view.cleared).toBe(0)
  expect(view.stages.map((s) => s.state)).toEqual(['open', 'open', 'locked', 'locked'])
  expect(view.next?.module_key).toBe('module-01')
})

test('buildStageMapView: non-ok map reads speak their own state, never a fake map', () => {
  for (const status of ['empty', 'error', 'denied', 'unauthorized', 'not-configured'] as const) {
    const view = buildStageMapView({ status, detail: 'why' }, { status: 'ok', uid: 'u1', rows: [] })
    expect(view).toEqual({ status, detail: 'why', stages: [], next: null, cleared: 0, total: 0 })
  }
})

test('buildStageMapView: a failed completions read degrades to NOTHING cleared (open/locked ride on)', () => {
  const view = buildStageMapView({ status: 'ok', modules: rows }, { status: 'error', detail: 'db' })
  expect(view.stages.map((s) => s.state)).toEqual(['open', 'open', 'locked', 'locked'])
  expect(view.next?.module_key).toBe('module-01')
})

test('ownCompletedModuleKeys: only the caller’s own rows count', () => {
  const missionRows = [
    { module_key: 'module-01', learner_id: 'me' },
    { module_key: 'module-02', learner_id: 'someone-else' },
    { module_key: 'module-03', learner_id: 'me' },
  ]
  expect(ownCompletedModuleKeys(missionRows, 'me')).toEqual(['module-01', 'module-03'])
  expect(ownCompletedModuleKeys(missionRows, '')).toEqual([])
})

test('Stage vocabulary: the primitive names locked semantics, never hides it', () => {
  const src = fs.readFileSync('components/StageNode.tsx', 'utf8')
  // Semantic lock: aria-disabled + the shipped stripes + the data-attribute
  // vocabulary (#45 reuses it); the clear mark + current-stage marker.
  expect(src).toContain('aria-disabled')
  expect(src).toContain('ppg-state-locked')
  expect(src).toContain('data-ppg-stage-state')
  expect(src).toContain('data-ppg-stage-current')
  expect(src).toContain('ppg-stage-clear-mark')
  expect(src).toContain('ppg-stage-connector')
  // A locked node has no route: the link only renders WHEN `href` is set.
  expect(src).toContain('{href ? (')
  // Keyboard: the node's link carries the focus-ring class (globals.css).
  expect(src).toContain('ppg-stage-link')
  const css = fs.readFileSync('app/globals.css', 'utf8')
  expect(css).toMatch(/\.ppg-stage-link:focus-visible\s*\{[^}]*outline:\s*var\(--ppg-focus-ring\)/)
})
