import 'server-only'

import {
  readCourseMapViaRpc,
  readLessonsViaRpc,
  readOwnCompletedModuleKeysViaTable,
} from './curriculum'
import { readOwnXpEventsViaTable } from './xp'
import { readMissionViaRpc } from './missions'
import { readPracticalMissionKeysViaTable, readPracticalMissionViaRpc } from './submissions'

/**
 * Ticket #45 (#41 stage 4) challenge-framing reads: the SIX read-only rows
 * every learner module surface merges into its challenge context — the
 * lesson read (content visibility), the caller's OWN XP ledger rows (the
 * grant records), the learner's OWN `complete` Mission rows (the clear
 * authority the unlock rule itself reads), the practical-kind catalog (which
 * screen the Mission is), the availability read OF THAT KIND (the SERVER's
 * gate — empty means locked, ok means attemptable), and the course map (the
 * next module's real lock state for the unlock feedback). Every read carries
 * the session JWT through the shipped domain readers — no service-role, no
 * rule, no write; the pure `buildChallengeContext` only names what these
 * reads already say. A module page renders its challenge framing from ONE
 * call here.
 */
export interface ChallengeReads {
  lessons: Awaited<ReturnType<typeof readLessonsViaRpc>>
  ledger: Awaited<ReturnType<typeof readOwnXpEventsViaTable>>
  completed: Awaited<ReturnType<typeof readOwnCompletedModuleKeysViaTable>>
  kinds: Awaited<ReturnType<typeof readPracticalMissionKeysViaTable>>
  /** The availability read of the module's OWN kind (practical upload vs
   * knowledge attempt — the catalog table decides which one speaks). */
  availability: Awaited<ReturnType<typeof readMissionViaRpc>> | Awaited<ReturnType<typeof readPracticalMissionViaRpc>>
  map: Awaited<ReturnType<typeof readCourseMapViaRpc>>
}

export async function readChallengeReads(moduleKey: string): Promise<ChallengeReads> {
  const [lessons, ledger, completed, kinds, knowledge, practical, map] = await Promise.all([
    readLessonsViaRpc(moduleKey),
    readOwnXpEventsViaTable(),
    readOwnCompletedModuleKeysViaTable(),
    readPracticalMissionKeysViaTable(),
    readMissionViaRpc(moduleKey),
    readPracticalMissionViaRpc(moduleKey),
    readCourseMapViaRpc(),
  ])
  const isPractical = kinds.status === 'ok' && (kinds.keys ?? []).includes(moduleKey)
  return { lessons, ledger, completed, kinds, availability: isPractical ? practical : knowledge, map }
}
