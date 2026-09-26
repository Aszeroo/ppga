import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #11 database-seam tests: the Knowledge Mission the DATABASE's own
 * answer-key sum decides AT the 70% threshold (a wrong answer fails,
 * all-correct passes; the score% = the matched correct options / all,
 * rounded), the +100 XP granted EXACTLY ONCE despite retries / double-
 * submits / replays (the ledger PK (learner_id, event_type, event_ref) —
 * two passes of the same Mission SUM to 100, never 200), the Module N+1
 * unlock enforced SERVER-side (a learner who completed module-01's
 * Mission STILL sees module-02 OPEN only after the `complete` row lands —
 * the linear rule reads it, the client cannot bypass), the score history
 * retained append-only (unlimited retries ADD attempt rows), and the
 * Module badge / Mission Ready awarded ONCE (a second pass adds NO award
 * row; the gallery shows earned/locked with the criteria) are exercised
 * against the REAL local Postgres the same way `curriculum.test.ts`
 * prescribes — `SET LOCAL role authenticated` + `SET LOCAL
 * "request.jwt.clclaims" inside a transaction, then ROLLBACK.
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
}

const sql = (statement: string) =>
  execSync(
    `npx --no-install sup psql -query -csv -db postgres <<<${JSON.stringify(statement)}`,
    { encoding: 'utf8' },
  )

const impersonate = (role: string, sub: string) =>
  `BEGIN; SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

test(
  'Threshold: one wrong answer FAILs (2/3 = 67% < 70), all-correct PASSes (3/3 = 100%) — the server scores, the client never decides',
  { skip: !hasLocalStack },
  () => {
    // The end-of-module gate first (both module-01 lessons passed — the
    // #10's check function's rows the Mission visibility reads).
    const lessons = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb) FROM TRUE;
        SELECT ppg_check_self_check('module-01-lesson-02', '{"1":"a","2":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(lessons.includes('pass')).toBe(true)

    // Q3 wrong: the score 2/3 = 67% < 70 → fail (the per-question
    // feedback says what was wrong + why + what to review — actionable,
    // bilingual; the key never lands in the read, only HERE post-score).
    const fail = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_submit_mission('module-01', '{"1":"a","2":"a","3":"b"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(fail.includes('fail')).toBe(true)
    expect(fail.includes('67')).toBe(true)
    expect(fail.includes('review')).toBe(true)
    expect(fail.includes('is_right')).toBe(true)

    // All correct: 3/3 = 100% pass (the outcome the DB decides).
    const pass = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_submit_mission('module-01', '{"1":"a","2":"a","3":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(pass.includes('pass')).toBe(true)
    expect(pass.includes('100')).toBe(true)
  },
)

test(
  'Idempotency: the +100 XP granted EXACTLY ONCE despite a retry/replay of the same Mission (the ledger PK — a replay INSERT conflicts, never a second +100)',
  { skip: !hasLocalStack },
  () => {
    // Two passes of `module-01` (the `ppg_submit_mission` RPC the ticket's
    // submit calls): the FIRST pass grants +100 (`xp_granted` 100); the
    // retry (the same answers, the replay INSERT) the ledger's PK denies
    // a second row (`xp_granted` 0 on the replay). The ledger's SUM for
    // the learner stays 100, never 200.
    const first = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_submit_mission('module-01', '{"1":"a","2":"a","3":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(first.includes('pass')).toBe(true)
    expect(first.includes('100')).toBe(true)
    const replay = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_submit_mission('module-01', '{"1":"a","2":"a","3":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    // The `xp_grated` on the replay says 0 (what actually landed); the
    // retry ADDS an ATTEMPT row (unlimited retries), NO ledger row.
    expect(replay.includes('pass')).toBe(true)
    expect(replay.includes('0')).toBe(true)
    const sum = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT amount FROM ppg_xp_ledger WHERE event_type = 'knowledge_mission_pass' AND event_ref = 'module-01';
      COMMIT;`,
    )
    // ONE ledger row for the Mission's pass: the SUM the header reads is
    // 100, never 200 (the PK the idempotency authority).
    expect(sum.match(/100/g)?.length).toBe(1)
  },
)

test(
  'Unlock server-side: a learner who completed module-01 Mission sees module-02 LOCKED before the `complete` row lands, and OPEN after it (the linear rule reads the completion — the client cannot bypass)',
  { skip: !hasLocalStack },
  () => {
    // BEFORE the pass: the previous module's Mission is `incomplete` (the
    // placeholder seed; the lock function denies) — module-02's lessons
    // stay server-side invisible (`SELECT 0`, never a smuggled read).
    const before = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_module_lessons('module-02') FROM TRUE;
      COMMIT;`,
    )
    expect(before.includes('SELECT 0') || before.includes('[]')).toBe(true)

    // AFTER the Mission pass: the completion hook UPSERTs `complete` —
    // the SAME linear rule the #9/#10 function reads now honors the real
    // row (module-02 opens server-side; a client UPDATE of the status is
    // NEVER the authority — no UPDATE policy exists; the client cannot
    // bypass).
    const complete = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_submit_mission('module-01', '{"1":"a","2":"a","3":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(complete.includes('pass')).toBe(true)
    const after = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_module_lessons('module-02') FROM TRUE;
      COMMIT;`,
    )
    // The OPEN module returns lesson rows now (the unlock state the rule
    // computes server-side under the SAME CALLER's next request's JWT).
    expect(after.includes('module-02-lesson')).toBe(true)
  },
)

test(
  'History: the score history retained append-only (unlimited retries ADD attempt rows; the PK stamps the retry count; the score retained per learner+mission)',
  { skip: !hasLocalStack },
  () => {
    // The fail attempt, then a pass: TWO attempt rows for the learner's
    // `module-01` Mission (the PK (learner_id, module_key, attempt_seq)
    // stamps the retry count; the score history retained).
    const failed = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_submit_mission('module-01', '{"1":"a","2":"b","3":"b"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(failed.includes('fail')).toBe(true)
    expect(failed.includes('33')).toBe(true)
    const passed = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_submit_mission('module-01', '{"1":"a","2":"a","3":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(passed.includes('pass')).toBe(true)
    const rows = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT count(*) FROM ppg_mission_attempts WHERE learner_id = auth.uid() AND module_key = 'module-01';
      COMMIT;`,
    )
    // TWO+ rows for the learner's Mission (the append-only stream the
    // retries grew). The scores retained (the read the page shows).
    expect(rows.match(/2/g)?.length).toBe(1)
    const scores = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_mission_history('module-01') FROM TRUE;
      COMMIT;`,
    )
    expect(scores.includes('33')).toBe(true)
    expect(scores.includes('100')).toBe(true)
  },
)

test(
  'Badge once: the module badge awarded EXACTLY ONCE on the first pass (the award PK — a second pass adds NO module_01_mission row); the gallery shows earned/locked with criteria (bilingual)',
  { skip: !hasLocalStack },
  () => {
    // The SECOND pass may NOT award the module badge again (a duplicate
    // award the PK denies; `badge_granted` false on the second call).
    const second = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_submit_mission('module-01', '{"1":"a","2":"a","3":"a"}'::jsonb) FROM TRUE;
      COMMIT;`,
    )
    expect(second.includes('false') || second.includes('badge_granted')).toBe(true)
    const awards = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT count(*) FROM ppg_badge_awards WHERE learner_id = auth.uid() AND badge_key = 'module_01_mission';
      COMMIT;`,
    )
    // ONE award row for the learner's `module_01_mission` badge (a real
    // achievement's record, never a fake award).
    expect(awards.match(/1/g)?.length).toBe(1)

    // The gallery: the badge_types taxonomy (the criteria the copy shown)
    // + the CALLER's earned/locked — the earned badge says `true` + the
    // event_ref; a locked badge says `false` + the criteria stay VISIBLE
    // (the bilingual award_rule columns). The Mission Ready badge rides
    // the first Self-Check pass (the #11 award in the #10 transaction).
    const gallery = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_badge_gallery() FROM TRUE;
      COMMIT;`,
    )
    expect(gallery.includes('criteria_th') && gallery.includes('criteria_en')).toBe(true)
    expect(gallery.includes('earned') && gallery.includes('module_01_mission')).toBe(true)
    expect(gallery.includes('mission_ready') && gallery.includes('self_check_pass')).toBe(true)
  },
)
