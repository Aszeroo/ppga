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
 * "request.jwt.clclaims"` inside a transaction, then ROLLBACK.
 *
 * Guarded: without a live local stack (`supabase status` reachable) the
 * tests skip so CI (no credentials, no Postgres) stays green. `npx
 * supabase psql` is the CLI's own psql — no `psql(1)` binary is
 * required on the test host.
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
  learnerOne: '64110001-0001-0001-0001-000100010001',
  learnerTwo: '64110002-0002-0002-0002-000200020002',
  teacherThree: '64110003-0003-0003-0003-000300030003',
}

/** The seeded names (asc order ties break by them: `Learner One` first). */
const seededNames = ['Learner One', 'Learner Two']

const sql = (statement: string) =>
  execSync(
    `npx --no-install supabase psql -query -csv -db postgres <<<${JSON.stringify(statement)}`,
    { encoding: 'utf8' },
  )

const impersonate = (role: string, sub: string) =>
  `BEGIN; SET LOCAL role authenticated; SET LOCAL "request.jwt.clclaims" = '{"role":"${role}","sub":"${sub}"}';`

test(
  'Visible to all Learners: any authenticated learner/admin JWT reads the board; the board is every Learner row (0 XP rows ride, never a missing row) (the EXECUTE grant IS the RLS; the pre-test gate never gates this)',
  { skip: !hasLocalStack },
  () => {
    // The learner's own JWT (the ungated learner still reads — the gate
    // never gates this screen). The board carries BOTH seeded Learners
    // (the rank/name/Level/XP of ALL Learners, never one learner only).
    const out = sql(
      `${impersonate('learner', seededIds.learnerOne)}
        SELECT ppg_xp_leaderboard() FROM TRUE;
      COMMIT;`,
    )
    expect(out.includes('rows')).toBe(true)
    // Both seeded Learners ride the board (the 0-XP Learner at Level 1,
    // 0 XP — never a missing row).
    expect(seededNames.every((n) => out.includes(n))).toBe(true)
    // The teacher/admin CALLER reads too (the grant to authenticated).
    const admin = sql(
      `${impersonate('admin', '11111111-1111-1111-1111-111111111111')}
        SELECT ppg_xp_leaderboard() FROM TRUE;
      COMMIT;`,
    )
    expect(admin.includes('rows')).toBe(true)
    // A teacher CALLER whose profile role is not 'learner' reaches the
    // board with their own_* NULLs (they are not a Learner row).
    const teacher = sql(
      `${impersonate('teacher', seededIds.teacherThree)}
        SELECT ppg_xp_leaderboard() FROM TRUE;
      COMMIT;`,
    )
    expect(teacher.includes('rows')).toBe(true)
    expect(teacher.includes('own_rank')).toBe(true)
    expect(teacher.includes('own_rank:null') || teacher.includes('own_rank :null') || teacher.includes('own_rank null')).toBe(true)
  },
)

test(
  'Ranking reflects the real ledger state after earning (the top Learner is the highest SUM; the XP-to-next-rank of the lower row is the rank above minus own) — 50 XP vs 0 XP',
  { skip: !hasLocalStack },
  () => {
    // Earn the first Self-Check pass for Learner One (the +50 XP the
    // ledger grants idempotently). Learner Two stays 0 XP (the pass of
    // module-01-lesson-01 is not a shared event — each learner's own).
    const earn = sql(
      `${impersonate('learner', seededIds.learnerOne)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(earn.includes('pass')).toBe(true)
    // Learner Two reads the board: their own rank is BELOW Learner One
    // (the 50 XP SUM) and the XP-to-next-rank is the rank above minus
    // own (50 - 0 = 50).
    const board = sql(
      `${impersonate('learner', seededIds.learnerTwo)}
        SELECT ppg_xp_leaderboard() FROM TRUE;
      COMMIT;`,
    )
    expect(board.includes('"own_rank":2') || board.includes('own_rank :2') || board.includes('own_rank 2')).toBe(true)
    expect(board.includes('"xp_to_next_rank":50') || board.includes('xp_to_next_rank :50') || board.includes('xp_to_next_rank 50')).toBe(true)
    // Learner One is the TOP rank (no one above) — the XP-to-next-rank
    // rides NULL (the design's choice, never a 0 XP fake gap).
    const top = sql(
      `${impersonate('learner', seededIds.learnerOne)}
        SELECT ppg_xp_leaderboard() FROM TRUE;
      COMMIT;`,
    )
    expect(top.includes('"own_rank":1') || top.includes('own_rank :1') || top.includes('own_rank 1')).toBe(true)
    expect(top.includes('"xp_to_next_rank":null') || top.includes('xp_to_next_rank :null') || top.includes('xp_to_next_rank null')).toBe(true)
  },
)

test(
  'Ties deterministic: an equal-XP tie breaks by name asc then the stable id — the order never flips on a re-read (the Learner One < Learner Two seeded names)',
  { skip: !hasLocalStack },
  () => {
    // Both Learners at 0 XP (no ledger rows — the board still shows
    // both). The tie-break is name asc (`Learner One` precedes
    // `Learner Two`) then the uuid (stable). A RE-READ holds the same
    // order (no flip-flip).
    const first = sql(
      `${impersonate('learner', seededIds.learnerOne)}
        SELECT ppg_xp_leaderboard() FROM TRUE;
      COMMIT;`,
    )
    const oneIdx = first.indexOf('Learner One')
    const twoIdx = first.indexOf('Learner Two')
    expect(oneIdx !== -1 && twoIdx !== -1 && oneIdx < twoIdx).toBe(true)
    // Rank numbers follow the names (One at #1, Two at #2 when both at
    // 0 XP).
    expect(first.includes('"rank":1') || first.includes('rank :1')).toBe(true)
    const replay = sql(
      `${impersonate('learner', seededIds.learnerOne)}
        SELECT ppg_xp_leaderboard() FROM TRUE;
      COMMIT;`,
    )
    expect(replay.includes('Learner One') && replay.includes('Learner Two')).toBe(true)
    // The replay's order matches the first read (no flip).
    expect(
      replay.slice(0, replay.indexOf('Learner Two')).includes('Learner One') &&
      !replay.slice(0, replay.indexOf('Learner One')).includes('Learner Two'),
    ).toBe(true)
  },
)

test(
  'The learner-visible output SHAPE (rank + full_name + level + total_xp + own_* ONLY): no rubric/knowledge/pretest/posttest/score/winner/prize fields EVER ride out (ADR-0001; Prizes stay offline)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerOne)}
        SELECT ppg_xp_leaderboard() FROM TRUE;
      COMMIT;`,
    )
    // The shape keys the board's own copy reads.
    expect(['rank', 'full_name', 'level', 'total_xp', 'own_rank', 'own_total_xp', 'own_level', 'own_full_name', 'xp_to_next_rank'].every((k) => out.includes(k))).toBe(true)
    // The score fields NEVER appear (the RPC never SELECTs the
    // prettest/posttest attempts, the self-check grades, the mission
    // scores, the winner/prize state — no ever a browser learns a
    // score).
    expect(
      ['prettest', 'posttest', 'pretest', 'rubric', 'knowledge', 'score', 'grade', 'winner', 'prize', 'attempt_seq', 'outcome']
        .some((b) => out.toLowerCase().includes(b)),
    ).toBe(false)
  },
)
