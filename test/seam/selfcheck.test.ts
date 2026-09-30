import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #10 database-seam tests: the Self-Check the DATABASE's own
 * answer-key sum decides (all-correct pass, wrong answers fail, unlimited
 * retries ADD event rows), the +50 XP granted EXACTLY ONCE despite retries
 * / double-submit / replays (the ledger's PK (learner_id, event_type,
 * event_ref) — a raw replay INSERT rides `duplicate key value`, never a
 * second +50), the Level/next-Level progress DERIVED from the real ledger
 * state (level = floor(total/100)+1: total 50 → 1, total 150 → 2 — no fake
 * numbers), the Mission gate the ticket asserts enforced server-side (a
 * learner who passed module-01's lessons still sees module-02 LOCKED — the
 * mission still decides the unlock), and the First Steps badge awarded ONCE
 * (a second pass, any lesson, adds NO award row) are exercised against the
 * REAL local Postgres the same way `curriculum.test.ts` prescribes —
 * `SET LOCAL role authenticated` + `SET LOCAL "request.jwt.claims"` inside
 * a transaction, then ROLLBACK.
 *
 * EVERY test is hermetic: the gate state (consent + a submitted response)
 * rides INSIDE the test's own transaction as the owner (RLS-bypass) and
 * ROLLS BACK — no COMMIT, no cross-file order dependence, no residue in
 * the shared container. `ppg_check_self_check`/`ppg_xp_summary` return one
 * jsonb value, so the asserts read the real jsonb shapes (`"outcome": "pass"`,
 * `"xp_granted": 50`, `"level": 2`) and labeled owner counts
 * (`SELECT 'pass=' || count(*) …`), never a command status.
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
    `docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`,
    { input: statement, encoding: 'utf8' },
  )

const asRole = (role: string, sub: string) =>
  `SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

// the gate OPENED inside the caller's open transaction (owner rights — the
// consent flag + a submitted response; rolled back with the tx).
const gateOpen = (learnerId: string) => `
  DELETE FROM ppg_pretest_responses WHERE learner_id = '${learnerId}';
  UPDATE ppg_profiles SET consent = true, prettest_unlocked_override = false
   WHERE id = '${learnerId}';
  INSERT INTO ppg_pretest_responses
    (learner_id, instrument_version, language, answers, submitted_at)
  VALUES ('${learnerId}', '2026.09.1', 'th', '{"item_1":"A"}'::jsonb, now());`

test(
  'Idempotency: the +50 XP granted EXACTLY ONCE despite a retry/replay of the same lesson (the ledger PK — a replay INSERT conflicts, never a second +50)',
  { skip: !hasLocalStack },
  () => {
    // Two passes of `module-01-lesson-01` for the gated learner (the
    // `ppg_check_self_check` RPC the ticket's submit calls): the FIRST pass
    // grants +50 (`"xp_granted": 50`); the replay says `"xp_granted": 0`
    // (what actually landed) and ADDS an event row (`"attempt_seq": 2`). A
    // RAW replay INSERT rides the ledger's PK — `duplicate key value`. The
    // ledger holds ONE row of 50 for the lesson, never 100.
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb);
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb);
        RESET ROLE;
        SELECT 'ledger_rows=' || count(*) FROM ppg_xp_ledger
         WHERE learner_id = '${seededIds.learner64110001}'
           AND event_type = 'self_check_pass' AND event_ref = 'module-01-lesson-01';
        SELECT 'xp_sum=' || sum(amount) FROM ppg_xp_ledger
         WHERE learner_id = '${seededIds.learner64110001}'
           AND event_type = 'self_check_pass' AND event_ref = 'module-01-lesson-01';
        -- the raw replay INSERT the PK denies (last statement; ROLLBACK ends)
        INSERT INTO ppg_xp_ledger (learner_id, event_type, event_ref, amount, created_at)
        VALUES ('${seededIds.learner64110001}', 'self_check_pass', 'module-01-lesson-01', 50, now());
      ROLLBACK;`,
    )
    expect(out.includes('"outcome": "pass"')).toBe(true)
    expect(out.includes('"xp_granted": 50')).toBe(true)
    expect(out.includes('"xp_granted": 0')).toBe(true)
    // the retry ADDS an EVENT row (unlimited retries), NO second ledger row
    expect(out.includes('"attempt_seq": 2')).toBe(true)
    expect(out.includes('ledger_rows=1')).toBe(true)
    // the SUM the header reads is 50, never 100
    expect(out.includes('xp_sum=50')).toBe(true)
    expect(out.includes('duplicate key value violates unique constraint')).toBe(true)
    expect(out.includes('xp_sum=100')).toBe(false)
  },
)

test(
  'Server-side check: wrong answers FAIL, all-correct PASS, a retry ADDS an event row (unlimited retries, no grade ever lands)',
  { skip: !hasLocalStack },
  () => {
    // Wrong on both questions (the key the DATABASE sums server-side: the
    // seeded `is_correct` is option 'a' each — 'b'/'c' are wrong). The fail
    // writes a fail EVENT row; the retry PASSes and ADDS its own event row
    // (unlimited retries). The events table carries pass|fail ONLY — a
    // grade/score column NEVER exists (ADR-0001: XP ≠ any score).
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"b","2":"c"}'::jsonb);
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb);
        RESET ROLE;
        SELECT 'fail=' || count(*) FROM ppg_self_check_events
         WHERE learner_id = '${seededIds.learner64110001}' AND outcome = 'fail';
        SELECT 'pass=' || count(*) FROM ppg_self_check_events
         WHERE learner_id = '${seededIds.learner64110001}' AND outcome = 'pass';
        SELECT 'grade_cols=' || count(*) FROM information_schema.columns
         WHERE table_name = 'ppg_self_check_events'
           AND column_name IN ('grade', 'score');
      ROLLBACK;`,
    )
    expect(out.includes('"outcome": "fail"')).toBe(true)
    expect(out.includes('"outcome": "pass"')).toBe(true)
    // one fail event, one pass event (the retry ADDS a row, attempt 2)
    expect(out.includes('fail=1')).toBe(true)
    expect(out.includes('pass=1')).toBe(true)
    expect(out.includes('"attempt_seq": 2')).toBe(true)
    // the outcomes carry pass|fail ONLY — no grade/score column ever lands
    expect(out.includes('grade_cols=0')).toBe(true)
  },
)

test(
  'Level: the real Level DERIVED from the ledger (floor(total/100)+1) — total 50 → Level 1, total 150 → Level 2 (no fake numbers)',
  { skip: !hasLocalStack },
  () => {
    // One real +50 (the lesson-01 pass via the RPC): the summary DERIVES
    // total 50 → level 1 (xp_to_next 50). Then a second award of +100
    // (a knowledge mission's grant, written owner-side inside the tx):
    // total 150 → level floor(150/100)+1 = 2 — the real derived state,
    // never a client count.
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb);
        SELECT ppg_xp_summary();
        RESET ROLE;
        INSERT INTO ppg_xp_ledger (learner_id, event_type, event_ref, amount, created_at)
        VALUES ('${seededIds.learner64110001}', 'knowledge_mission_pass', 'module-02', 100, now());
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_xp_summary();
      ROLLBACK;`,
    )
    // total 50 → Level 1 (the real derived state, never a client count)
    expect(out.includes('"total_xp": 50')).toBe(true)
    expect(out.includes('"level": 1')).toBe(true)
    // the xp_to_next says the next threshold (level*100 - total): 100-50
    expect(out.includes('"xp_to_next": 50')).toBe(true)
    // total 150 → Level 2 (floor(150/100)+1)
    expect(out.includes('"total_xp": 150')).toBe(true)
    expect(out.includes('"level": 2')).toBe(true)
  },
)

test(
  'Mission gate: a learner who passed module-01\'s lessons STILL sees module-02 LOCKED (the mission still decides the unlock server-side)',
  { skip: !hasLocalStack },
  () => {
    // Pass BOTH module-01 lessons (the learner passed the LAST lesson of
    // module 1 — module 1 is self-check complete — but the next module
    // opens on its MISSION's `complete`, the placeholder rows this ticket
    // does NOT write). So module-02's lessons stay server-side invisible:
    // the detail answers `[]`, never a smuggled read (module-02-lesson-01
    // IS seeded — `[]` means LOCKED, not empty content).
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb);
        SELECT ppg_check_self_check('module-01-lesson-02', '{"1":"a","2":"a"}'::jsonb);
        SELECT ppg_module_lessons('module-02');
        RESET ROLE;
        SELECT 'passes=' || count(*) FROM ppg_self_check_events
         WHERE learner_id = '${seededIds.learner64110001}' AND outcome = 'pass';
      ROLLBACK;`,
    )
    // the two passes really happened (module 1 self-check complete)
    expect(out.includes('passes=2')).toBe(true)
    // the locked module returns `[]` — no lesson rows server-side
    expect(out.includes('[]')).toBe(true)
    expect(out.includes('module-02-lesson-01')).toBe(false)
  },
)

test(
  'Badge once: the First Steps badge awarded EXACTLY ONCE despite a second pass of ANOTHER lesson (the award PK (learner_id, badge_key))',
  { skip: !hasLocalStack },
  () => {
    // The lesson-01 pass awards First Steps (`"badge_granted": true`); the
    // lesson-02 pass (a DIFFERENT lesson) may NOT award it again — the
    // award PK (learner_id, badge_key) is the authority: `"badge_granted":
    // false` and still ONE award row for the learner's `first_steps` badge.
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb);
        SELECT ppg_check_self_check('module-01-lesson-02', '{"1":"a","2":"a"}'::jsonb);
        SELECT 'first_steps=' || count(*) FROM ppg_badge_awards
         WHERE badge_key = 'first_steps' AND learner_id = auth.uid();
      ROLLBACK;`,
    )
    // the first pass grants the badge; the second pass (another lesson) does NOT
    expect(out.includes('"badge_granted": true')).toBe(true)
    expect(out.includes('"badge_granted": false')).toBe(true)
    // ONE award row for the learner's `first_steps` badge (a real
    // achievement's record, never a fake award).
    expect(out.includes('first_steps=1')).toBe(true)
  },
)
