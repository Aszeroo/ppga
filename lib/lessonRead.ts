/**
 * PPGA #141 lesson read claim: pure state logic.
 *
 * The player starts in `awarded` when the server already found the caller's
 * `lesson_read` ledger row for this lesson (`readAwarded`), so a revisit shows
 * "already claimed" without a click. A claim click moves idle -> pending ->
 * awarded | already | error. Nothing here writes; the route's RPC is the
 * authority and the state only reflects its answer.
 */

export type LessonReadClaimState = 'awarded' | 'pending' | 'idle' | 'already' | 'error'

export interface LessonReadResponse {
  ok?: boolean
  awarded?: boolean
  already?: boolean
  amount?: number
  total?: number
  detail?: string
}

/** The initial state: a server-side ledger row means "already claimed". */
export function initialLessonReadState(readAwarded: boolean): LessonReadClaimState {
  return readAwarded ? 'already' : 'idle'
}

/** Map the route/RPC response to the visible state. `ok:false` and a
 * malformed body both land on `error`; only an explicit `awarded`/`already`
 * answer leaves the pending state. */
export function lessonReadStateFromResponse(
  responseOk: boolean,
  data: LessonReadResponse | null | undefined,
): LessonReadClaimState {
  if (!responseOk || !data || data.ok !== true) return 'error'
  if (data.awarded === true) return 'awarded'
  if (data.already === true) return 'already'
  return 'error'
}

/** The copy key the player should speak for a state (keeps the component's
 * render table small and the mapping testable). */
export function lessonReadCopyKey(
  state: LessonReadClaimState,
): 'button' | 'pending' | 'awarded' | 'already' | 'error' {
  if (state === 'pending') return 'pending'
  if (state === 'awarded') return 'awarded'
  if (state === 'already') return 'already'
  if (state === 'error') return 'error'
  return 'button'
}
