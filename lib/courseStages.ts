/**
 * Ticket #44 (#41 stage 3) Course Map stage model: the PURE derivation the
 * stage map renders — the `ppg_course_map` rows (every SEE-ABLE module + the
 * real `open|locked` the linear rule computes server-side) merged with the
 * learner's OWN `complete` Mission rows (the same authority the unlock rule
 * reads: a knowledge pass and a practical approval both UPSERT it) into one
 * ordered stage list of `cleared | open | locked` + the real next-stage
 * frontier. No rules live here — the DATABASE decided every state; this only
 * names what the reads already say. No server imports: the pure totals are
 * unit-testable like `lib/shellFrame.ts` / `lib/dashboardHub.ts`.
 */

/** One stage state the map speaks: cleared (own Mission complete), open
 * (the linear rule unlocked it), locked (the rule keeps it shut). */
export type StageState = 'cleared' | 'open' | 'locked'

/** The structural shape of a `ppg_course_map` row (no server-only import). */
export interface StageMapRow {
  module_key: string
  order_index: number
  title_th: string
  title_en: string
  summary_th: string
  summary_en: string
  lock_state: 'open' | 'locked'
}

/** The structural shape of `readCourseMapViaRpc`'s result. */
export interface StageMapRead {
  status: string
  detail?: string
  modules?: StageMapRow[]
}

/** The structural shape of `readOwnCompletedModuleKeysViaTable`'s result:
 * the CALLER's own mission rows + the caller's uid the pure filter needs. */
export interface CompletedRead {
  status: string
  detail?: string
  uid?: string
  rows?: Array<{ module_key: string; learner_id: string }>
}

/** One merged stage: the row + the map's own state for it. */
export interface Stage {
  module_key: string
  order_index: number
  title_th: string
  title_en: string
  summary_th: string
  summary_en: string
  state: StageState
}

/** The whole map view the page renders. */
export interface StageMapView {
  /** The Course-map read's own status ('ok' or the state the page speaks). */
  status: string
  detail?: string
  stages: Stage[]
  /** The real next-stage direction: the first OPEN stage, or null. */
  next: Stage | null
  cleared: number
  total: number
}

/**
 * The learner's own completions, IN JS: a learner's RLS read is already
 * own-rows-only, but a teacher/admin's read of `ppg_module_missions` sees
 * EVERY learner's rows — on the Course map (no single-learner context) only
 * rows whose `learner_id` IS the caller count as cleared, so a Teacher
 * browsing the map sees the rule's open/locked, never someone else's
 * progress. The filter never invents a completion.
 */
export function ownCompletedModuleKeys(
  rows: readonly { module_key: string; learner_id: string }[],
  uid: string,
): string[] {
  return rows.filter((r) => r.learner_id === uid).map((r) => r.module_key)
}

/** Merge the rows + the own completions into the ordered stage list. A
 * completion for a module the caller cannot SEE is ignored (never renders a
 * phantom stage). */
export function deriveStages(
  rows: readonly StageMapRow[],
  completedKeys: readonly string[],
): Stage[] {
  const done = new Set(completedKeys)
  return [...rows]
    .sort((a, b) => a.order_index - b.order_index)
    .map((r) => ({
      module_key: r.module_key,
      order_index: r.order_index,
      title_th: r.title_th,
      title_en: r.title_en,
      summary_th: r.summary_th,
      summary_en: r.summary_en,
      state: (done.has(r.module_key) ? 'cleared' : r.lock_state) as StageState,
    }))
}

/** The next-stage direction: the FIRST stage still open (the frontier the
 * linear rule leaves); null when nothing is open-and-uncleared. */
export function deriveNextStage(stages: readonly Stage[]): Stage | null {
  return stages.find((s) => s.state === 'open') ?? null
}

/** Normalize the two reads into the map view: a non-ok map read speaks its
 * own state (no stages, no invented direction); a failed completions read
 * degrades to NOTHING CLEARED (open/locked still ride the map read). */
export function buildStageMapView(map: StageMapRead, completed: CompletedRead): StageMapView {
  if (map.status !== 'ok') {
    return { status: map.status, detail: map.detail, stages: [], next: null, cleared: 0, total: 0 }
  }
  const completedUsable = completed.status === 'ok' ? (completed.rows ?? []) : []
  const uid = completed.uid ?? ''
  const stages = deriveStages(map.modules ?? [], ownCompletedModuleKeys(completedUsable, uid))
  return {
    status: 'ok',
    stages,
    next: deriveNextStage(stages),
    cleared: stages.filter((s) => s.state === 'cleared').length,
    total: stages.length,
  }
}
