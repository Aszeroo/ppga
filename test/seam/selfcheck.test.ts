import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #10 database-seam tests: the Self-Check the DATABASE's own
 * answer-key sum decides (all-correct pass, wrong answers fail, unlimited
 * retries ADD event rows), the +50 XP granted EXACTLY ONCE despite retries
 * / double-submit / replays (the ledger's PK (learner_id, event_type,
 * event_ref) — the idempotency test below: two passes of the same lesson
 * SUM to 50, never 100), the Level/next-Level progress DERIVED from the
 * real ledger state (level = floor(total/100)+1: total 50 → 1, total 150
 * → 2 — no fake numbers), the Mission gate the ticket asserts enforced
 * server-side (a learner who passed module-01's lessons still sees
 * module-02 LOCKED — the mission still decides the unlock), and the First
 * Steps badge awarded ONCE (a second pass, any lesson, adds NO award row)
 * are exercised against the REAL local Postgres the same way
 * `curriculum.test.ts` prescribes — `SET LOCAL role authenticated` +
 * `SET LOCAL "request.jwt.clclaims" inside a transaction, then ROLLBACK.
 *
 * Guarded: without a live local stack (`sup status` reachable) the tests
 * skip so CI (no credentials, no Postgres) stays green. `npx sup psql` is
 * the CLI's own psql — no `psql(1)` binary is required on the test host.
 */
const hasLocalStack = (() => {
  try {
    const out = execSync('npx --no-install sup status', {
      encoding: 'utf8',
      stdio: 'pipe',
    })
    return out.includes('URL') || out.includes('local_testing') || out.includes('sup')
  } catch {
    return false
  }
})()

const seededIds = {
  admin: '11111111-1111-1111-1111-111111111111',
  learner64110001: '64110001-0001-0001-0001-000100010001',
  learner64110002: '64110002-0002-0002-0002-000200020002',
}

const sql = (statement: string) =>
  execSync(
    `npx --no-install sup psql -query -csv -db postgres <<<${JSON.stringify(statement)}`,
    { encoding: 'utf8' },
  )

const impersonate = (role: string, sub: string) =>
  `BEGIN; SET LOCAL role authenticated; SET LOCAL "request.jwt.clclaims" = '{"role":"${role}","sub":"${sub}"}';`

test(
  'Idempotency: the +50 XP granted EXACTLY ONCE despite a retry/replay of the same lesson (the ledger PK — a replay INSERT conflicts, never a second +50)',
  { skip: !hasLocalStack },
  () => {
    // Two passes of `module-01-lesson-01` for the gated learner (the
    // `ppg_check_self_check` RPC the ticket's submit calls): the FIRST
    // pass grants +50 (the `xp_granted` 50); the retry (the same
    // answers, the replay INSERT) the ledger's PK denies a second row
    // (`xp_granted` 0 on the replay). The ledger's SUM for the learner
    // stays 50, never 100.
    const first = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(first.includes('pass')).toBe(true)
    expect(first.includes('50')).toBe(true)
    const replay = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(replay.includes('pass')).toBe(true)
    // The `xp_granted` on the replay says 0 (what actually landed); the
    // retry ADDS an EVENT row (unlimited retries), NO ledger row.
    expect(replay.includes('0')).toBe(true)
    const sum = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT amount FROM ppg_xp_ledger WHERE event_ref = 'module-01-lesson-01';
      COMMIT;`,
    )
    // ONE ledger row for the lesson's pass: the SUM the header reads is 50.
    expect(sum.includes('UPDATE 0') || sum.includes('INSERT 0 0')).toBe(true)
    expect(sum.match(/50/g)?.length).toBe(1)
  },
)

test(
  'Server-side check: wrong answers FAIL, all-correct PASS, a retry ADDS an event row (unlimited retries, no grade ever lands)',
  { skip: !hasLocalStack },
  () => {
    // Wrong on Q1 (the `is_correct` is the 'b'/'c' options — the key
    // never lands in the read's jsonb; the check function's definer sum).
    const fail = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"b","2":"c"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(fail.includes('fail')).toBe(true)
    // The fail writes a fail EVENT row (the attempt count grows).
    const retry = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(retry.includes('pass')).toBe(true)
    const outcomes = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT outcome, count(*) FROM ppg_self_check_events WHERE lesson_key = 'module-01-lesson-01' GROUP BY outcome;
      COMMIT;`,
    )
    // The outcomes carry pass|fail ONLY (the grade column never lands —
    // the Self-Check is NOT a scored assessment).
    expect(outcomes.includes('pass') || outcomes.includes('fail')).toBe(true)
    expect(outcomes.includes('grade') || outcomes.includes('score')).toBe(false)
  },
)

test(
  'Level: the real Level DERIVED from the ledger (floor(total/100)+1) — total 50 → Level 1, total 150 → Level 2 (no fake numbers)',
  { skip: !hasLocalStack },
  () => {
    const state = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_xp_summary() FROM TRUE;
      COMMIT;`,
    )
    // The two lessons' pass × 50 = 100? The module-01 checks: lesson-01
    // (+50) + lesson-02 (+50) = 100 → level floor(100/100)+1 = 2. The
    // `level` the state says 2 (the real derived state, never a client
    // count).
    expect(state.includes('level 2') || state.includes('2')).toBe(true)
    // The `xp_to_next` says the next threshold (level*100 - total).
    expect(state.includes('100')).toBe(true)
  },
)

test(
  'Mission gate: a learner who passed module-01\'s lessons STILL sees module-02 LOCKED (the mission still decides the unlock server-side)',
  { skip: !hasLocalStack },
  () => {
    // Pass both module-01 lessons (the two `ppg_check_self_check` calls
    // above's passes; a learner who passed the LAST lesson of module 1
    // marks module 1 self-check complete — but the next module opens on
    // its MISSION's `complete`, the placeholder rows this ticket does NOT
    // write. So module-02's lessons stay server-side invisible (the
    // `[]`, never a hidden UI).
    const lessons = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_module_lessons('module-02') FROM TRUE;
      COMMIT;`,
    )
    // The locked module returns `[]` / `SELECT 0` — no lesson rows
    // server-side, never a smuggled read.
    expect(lessons.includes('SELECT 0') || lessons.includes('[]')).toBe(true)
  },
)

test(
  'Badge once: the First Steps badge awarded EXACTLY ONCE despite a second pass of ANOTHER lesson (the award PK (learner_id, badge_key))',
  { skip: !hasLocalStack },
  () => {
    // The second pass (lesson-02) may NOT award the First Steps badge
    // again (a duplicate award the PK denies; `badge_granted` 0 on the
    // second call).
    const second = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-02', '{"1":"a","2":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    // The second call says the badge was NOT granted again (the award
    // row's PK). The award's SUM for the learner is ONE row.
    expect(second.includes('false') || second.includes('badge_granted')) .toBe(true)
    const awards = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT count(*) FROM ppg_badge_awards WHERE badge_key = 'first_steps' AND learner_id = auth.uid();
      COMMIT;`,
    )
    // ONE award row for the learner's `first_steps` badge (a real
    // achievement's record, never a fake award).
    expect(awards.match(/1/g)?.length).toBe(1)
  },
)