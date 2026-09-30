import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #12 database-seam tests: the XP leaderboard — the ranking the
 * real ledger state the `ppg_xp_leaderboard` RPC the board page reads
 * speaks (top Learner the highest SUM; the a 0-XP Learner still rides
 * the board at Level 1, 0 XP, never a missing row), the XP-to-next-rank
 * computed correctly (the rank above minus own; the top Learner gets
 * NULL (the design's choice: no one above them — the UI reads "no one
 * above you", never a 0 XP fake gap)), the TIES deterministic (a tie at
 * XP breaks by name asc then the stable uuid — the order NEVER flips on
 * a re-read), the VISIBLE-to-all rule (any authenticated learner/
 * teacher/admin's JWT reads the board — the EXECUTE grant IS the RLS;
 * the pre-test gate never gates this screen), and the learner-visible
 * output SHAPE (rank + full_name + Level + total_xp + own_* ONLY)
 * asserted against the REAL local Postgres the same way `rls.test.ts`
 * prescribes it — `SET LOCAL role authenticated` + `SET LOCAL
 * "request.jwt.claims"` inside a transaction, then ROLLBACK.
 *
 * EVERY test is hermetic: the 0-XP baseline (the owner-side ledger cleanup
 * — the ledger carries NO append-only trigger, unlike the rubric reviews)
 * and the +50 the ranking test earns ride INSIDE the test's own
 * transaction and ROLL BACK — no COMMIT, no cross-file order dependence,
 * no residue in the shared container. The RPC returns ONE jsonb value, so
 * the asserts read the real jsonb shapes (`"own_rank": 2`, `"xp_to_next_
 * rank": null`), never a command status (`-tA` never prints one); every
 * probe is LABELLED (`learner=`, `board2=`…) to keep the values
 * separable.
 *
 * Guarded: without a live local stack (`supabase status` reachable) the
 * tests skip so CI (no credentials, no Postgres) stays green.
 */
const hasLocalStack = (() => {
  try {
    const out = execSync('npx --no-install supabase status', {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return out.includes('URL') || out.includes('local_testing') || out.includes('supabase')
  } catch {
    return false
  }
})()

const seededIds = {
  admin: '11111111-1111-1111-1111-111111111111',
  learnerOne: '64110001-0001-0001-0001-000100010001',
  learnerTwo: '64110002-0002-0002-0002-000200020002',
  teacherThree: '64110003-0003-0003-0003-000300030003',
}

/** The seeded names (asc order ties break by them: `Learner One` first). */
const seededNames = ['Learner One', 'Learner Two']

const sql = (statement: string) =>
  execSync(
    `docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`,
    { input: statement, encoding: 'utf8' },
  )

const asRole = (role: string, sub: string) =>
  `SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

// the claims switch mid-tx for a DIFFERENT actor (the tx already carries
// `SET LOCAL role authenticated`).
const asClaims = (role: string, sub: string) =>
  `SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

// the hermetic 0-XP baseline for BOTH seeded Learners, owner-side (RLS
// bypassed; the ledger has no deny triggers) — rolled back with the tx.
const xpBaseline = `
  DELETE FROM ppg_xp_ledger
  WHERE learner_id IN ('${seededIds.learnerOne}', '${seededIds.learnerTwo}');`

// the gate OPENED inside the caller's open transaction (owner rights — the
// consent flag + a submitted response) — the #10 Self-Check the ranking
// test earns its +50 through; rolled back with the tx.
const gateOpen = (learnerId: string) => `
  DELETE FROM ppg_pretest_responses WHERE learner_id = '${learnerId}';
  UPDATE ppg_profiles SET consent = true, prettest_unlocked_override = false
   WHERE id = '${learnerId}';
  INSERT INTO ppg_pretest_responses
    (learner_id, instrument_version, language, answers, submitted_at)
  VALUES ('${learnerId}', '2026.09.1', 'th', '{"item_1":"A"}'::jsonb, now());`

// the value of one LABELLED probe (one `-tA` line, `label=...`).
const probe = (out: string, label: string) => {
  const start = out.indexOf(`${label}=`)
  if (start === -1) return ''
  const rest = out.slice(start + label.length + 1)
  const next = rest.indexOf('\n')
  return next === -1 ? rest : rest.slice(0, next)
}

test(
  'Visible to all Learners: any authenticated learner/admin JWT reads the board; the board is every Learner row (0 XP rows ride, never a missing row) (the EXECUTE grant IS the RLS; the pre-test gate never gates this)',
  { skip: !hasLocalStack },
  () => {
    // The learner's own JWT (the UNGATED learner still reads — the seeded
    // baseline holds no consent/no submitted response for the Learners,
    // and the gate NEVER gates this screen). The board carries BOTH seeded
    // Learners (the rank/name/Level/XP of ALL Learners, never one learner
    // only) — at the 0-XP baseline BOTH ride at Level 1, 0 XP.
    const out = sql(
      `BEGIN;
        ${xpBaseline}
        ${asRole('learner', seededIds.learnerOne)}
        SELECT 'learner='||ppg_xp_leaderboard()::text;
        ${asClaims('admin', seededIds.admin)}
        SELECT 'admin='||ppg_xp_leaderboard()::text;
        ${asClaims('teacher', seededIds.teacherThree)}
        SELECT 'teacher='||ppg_xp_leaderboard()::text;
      ROLLBACK;`,
    )
    const learnerBoard = probe(out, 'learner')
    expect(learnerBoard.includes('"rows": [')).toBe(true)
    // Both seeded Learners ride the board (the 0-XP Learner at Level 1,
    // 0 XP — never a missing row).
    expect(seededNames.every((n) => learnerBoard.includes(n))).toBe(true)
    expect(learnerBoard.includes('"rank": 1, "level": 1, "total_xp": 0, "full_name": "Learner One"')).toBe(true)
    expect(learnerBoard.includes('"rank": 2, "level": 1, "total_xp": 0, "full_name": "Learner Two"')).toBe(true)
    // The teacher/admin CALLER reads too (the grant to authenticated).
    const adminBoard = probe(out, 'admin')
    expect(adminBoard.includes('"rows": [')).toBe(true)
    expect(seededNames.every((n) => adminBoard.includes(n))).toBe(true)
    // A teacher CALLER whose profile role is not 'learner' reaches the
    // board with their own_* NULLs (they are not a Learner row).
    const teacherBoard = probe(out, 'teacher')
    expect(teacherBoard.includes('"rows": [')).toBe(true)
    expect(teacherBoard.includes('"own_rank": null')).toBe(true)
    expect(teacherBoard.includes('"own_total_xp": null')).toBe(true)
    expect(teacherBoard.includes('"xp_to_next_rank": null')).toBe(true)
  },
)

test(
  'Ranking reflects the real ledger state after earning (the top Learner is the highest SUM; the XP-to-next-rank of the lower row is the rank above minus own) — 50 XP vs 0 XP',
  { skip: !hasLocalStack },
  () => {
    // Earn the first Self-Check pass for Learner One (the +50 XP the
    // ledger grants idempotently — the REAL #10 path, not a fake row).
    // Learner Two stays 0 XP (the pass of module-01-lesson-01 is not a
    // shared event — each learner's own).
    const out = sql(
      `BEGIN;
        ${xpBaseline}
        ${gateOpen(seededIds.learnerOne)}
        ${asRole('learner', seededIds.learnerOne)}
        SELECT 'earn='||ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb)::text;
        ${asClaims('learner', seededIds.learnerTwo)}
        SELECT 'board2='||ppg_xp_leaderboard()::text;
        ${asClaims('learner', seededIds.learnerOne)}
        SELECT 'board1='||ppg_xp_leaderboard()::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'earn').includes('"outcome": "pass"')).toBe(true)
    expect(probe(out, 'earn').includes('"xp_granted": 50')).toBe(true)
    // Learner Two reads the board: their own rank is BELOW Learner One
    // (the 50 XP SUM) and the XP-to-next-rank is the rank above minus
    // own (50 - 0 = 50).
    const board2 = probe(out, 'board2')
    expect(board2.includes('"own_rank": 2')).toBe(true)
    expect(board2.includes('"own_total_xp": 0')).toBe(true)
    expect(board2.includes('"xp_to_next_rank": 50')).toBe(true)
    // Learner One is the TOP rank (no one above) — the XP-to-next-rank
    // rides NULL (the design's choice, never a 0 XP fake gap).
    const board1 = probe(out, 'board1')
    expect(board1.includes('"own_rank": 1')).toBe(true)
    expect(board1.includes('"own_total_xp": 50')).toBe(true)
    expect(board1.includes('"xp_to_next_rank": null')).toBe(true)
  },
)

test(
  'Ties deterministic: an equal-XP tie breaks by name asc then the stable id — the order never flips on a re-read (the Learner One < Learner Two seeded names)',
  { skip: !hasLocalStack },
  () => {
    // Both Learners at 0 XP (the owner-side ledger cleanup holds the
    // baseline — the board still shows both). The tie-break is name asc
    // (`Learner One` precedes `Learner Two`) then the uuid (stable). A
    // RE-READ holds the same order (no flip-flip).
    const out = sql(
      `BEGIN;
        ${xpBaseline}
        ${asRole('learner', seededIds.learnerOne)}
        SELECT 'first='||ppg_xp_leaderboard()::text;
        SELECT 'replay='||ppg_xp_leaderboard()::text;
      ROLLBACK;`,
    )
    const first = probe(out, 'first')
    const oneIdx = first.indexOf('Learner One')
    const twoIdx = first.indexOf('Learner Two')
    expect(oneIdx !== -1 && twoIdx !== -1 && oneIdx < twoIdx).toBe(true)
    // Rank numbers follow the names (One at #1, Two at #2 when both at
    // 0 XP).
    expect(first.includes('{"rank": 1, "level": 1, "total_xp": 0, "full_name": "Learner One"}')).toBe(true)
    expect(first.includes('{"rank": 2, "level": 1, "total_xp": 0, "full_name": "Learner Two"}')).toBe(true)
    const replay = probe(out, 'replay')
    expect(replay.includes('Learner One') && replay.includes('Learner Two')).toBe(true)
    // The replay's order matches the first read (no flip — the board is
    // byte-identical across reads).
    expect(replay.indexOf('Learner One') < replay.indexOf('Learner Two')).toBe(true)
    expect(replay).toBe(first)
  },
)

test(
  'The learner-visible output SHAPE (rank + full_name + level + total_xp + own_* ONLY): no rubric/knowledge/pretest/posttest/score/winner/prize fields EVER ride out (ADR-0001; Prizes stay offline)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${xpBaseline}
        ${asRole('learner', seededIds.learnerOne)}
        SELECT 'board='||ppg_xp_leaderboard()::text;
      ROLLBACK;`,
    )
    const board = probe(out, 'board')
    expect(board.length > 0).toBe(true)
    // The shape keys the board's own copy reads.
    expect(
      ['rank', 'full_name', 'level', 'total_xp', 'own_rank', 'own_total_xp',
        'own_level', 'own_full_name', 'xp_to_next_rank']
        .every((k) => board.includes(k)),
    ).toBe(true)
    // The score fields NEVER appear (the RPC never SELECTs the
    // prettest/posttest attempts, the self-check grades, the mission
    // scores, the winner/prize state — no ever a browser learns a
    // score).
    expect(
      ['prettest', 'posttest', 'pretest', 'rubric', 'knowledge', 'score', 'grade', 'winner', 'prize', 'attempt_seq', 'outcome']
        .some((b) => board.toLowerCase().includes(b)),
    ).toBe(false)
  },
)
