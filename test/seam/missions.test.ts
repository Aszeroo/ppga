import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #11 database-seam tests: the Knowledge Mission the DATABASE's own
 * answer-key sum decides AT the 70% threshold (a wrong answer fails,
 * all-correct passes; the score% = the matched correct options / all,
 * rounded), the +100 XP granted EXACTLY ONCE despite retries / double-
 * submits / replays (the ledger PK (learner_id, event_type, event_ref) —
 * two passes of the same Mission SUM to 100, never 200), the Module N+1
 * unlock enforced SERVER-side (a learner who completed module-01's Mission
 * STILL sees module-02 OPEN only after the `complete` row lands — the
 * linear rule reads it, the client cannot bypass), the score history
 * retained append-only (unlimited retries ADD attempt rows), and the Module
 * badge / Mission Ready awarded ONCE (a second pass adds NO award row; the
 * gallery shows earned/locked with the criteria) are exercised against the
 * REAL local Postgres the same way `curriculum.test.ts` prescribes —
 * `SET LOCAL role authenticated` + `SET LOCAL "request.jwt.claims"` inside
 * a transaction, then ROLLBACK.
 *
 * EVERY test is hermetic: the #8 gate (consent + a submitted response) and
 * the end-of-module Self-Check pass ride INSIDE the test's own transaction
 * (owner statements first — RLS bypassed — then the impersonated learner),
 * the ledger/award baselines are cleaned in-tx too, and the WHOLE tx ROLLS
 * BACK — never a COMMIT, never a residue in the shared container. `-tA`
 * prints VALUES ONLY (never a command status, never the query text), so
 * every probe is LABELLED (`fail=`, `ledger=`…) and the asserts read the
 * real jsonb shapes and counts, never `SELECT 0`-style statuses.
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
  learner64110001: '64110001-0001-0001-0001-000100010001',
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

// the module-01 lessons' seeded answer key is a/a (2 correct options each)
// — the end-of-module gate the Mission visibility reads.
const SC_PASS = '{"1":"a","2":"a"}'
// the module-01 Mission's seeded answer key is a/a/a (3 correct options):
// the all-correct submission, the one-wrong-answer one (2/3 = 67 < 70) and
// the one-right one (1/3 = 33) the threshold rides.
const ALL_A = '{"1":"a","2":"a","3":"a"}'
const ONE_WRONG = '{"1":"a","2":"a","3":"b"}'
const ONE_RIGHT = '{"1":"a","2":"b","3":"b"}'

// the value of one LABELLED probe (one `-tA` line, `label=...`).
const probe = (out: string, label: string) => {
  const start = out.indexOf(`${label}=`)
  if (start === -1) return ''
  const rest = out.slice(start + label.length + 1)
  const next = rest.indexOf('\n')
  return next === -1 ? rest : rest.slice(0, next)
}

test(
  'Threshold: one wrong answer FAILs (2/3 = 67% < 70), all-correct PASSes (3/3 = 100%) — the server scores, the client never decides',
  { skip: !hasLocalStack },
  () => {
    // The end-of-module gate first (both module-01 lessons passed — the
    // #10's check function's rows the Mission visibility reads), then the
    // two submissions, ALL inside ONE rolled-back transaction.
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT 'sc1='||ppg_check_self_check('module-01-lesson-01', '${SC_PASS}'::jsonb)::text;
        SELECT 'sc2='||ppg_check_self_check('module-01-lesson-02', '${SC_PASS}'::jsonb)::text;
        SELECT 'fail='||ppg_submit_mission('module-01', '${ONE_WRONG}'::jsonb)::text;
        SELECT 'pass='||ppg_submit_mission('module-01', '${ALL_A}'::jsonb)::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'sc1').includes('"outcome": "pass"')).toBe(true)
    expect(probe(out, 'sc2').includes('"outcome": "pass"')).toBe(true)

    // Q3 wrong: the score 2/3 = 67% < 70 → fail (the per-question
    // feedback says what was wrong + why + what to review — actionable,
    // bilingual; the key never lands in the read, only HERE post-score).
    const fail = probe(out, 'fail')
    expect(fail.includes('"outcome": "fail"')).toBe(true)
    expect(fail.includes('"score_pct": 67')).toBe(true)
    expect(fail.includes('is_right')).toBe(true)
    expect(fail.includes('"is_right": false')).toBe(true)
    expect(fail.includes('review_en')).toBe(true)

    // All correct: 3/3 = 100% pass (the outcome the DB decides) — the
    // FIRST pass also wires the +100/xp_granted the #11 return says.
    const pass = probe(out, 'pass')
    expect(pass.includes('"outcome": "pass"')).toBe(true)
    expect(pass.includes('"score_pct": 100')).toBe(true)
    expect(pass.includes('"xp_granted": 100')).toBe(true)
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
    // the learner stays 100, never 200 — the owner-side counts AFTER the
    // replay (RESET ROLE, RLS bypassed) are the authority.
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        DELETE FROM ppg_xp_ledger
         WHERE learner_id = '${seededIds.learner64110001}'
           AND event_type = 'knowledge_mission_pass' AND event_ref = 'module-01';
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '${SC_PASS}'::jsonb);
        SELECT ppg_check_self_check('module-01-lesson-02', '${SC_PASS}'::jsonb);
        SELECT 'first='||ppg_submit_mission('module-01', '${ALL_A}'::jsonb)::text;
        SELECT 'replay='||ppg_submit_mission('module-01', '${ALL_A}'::jsonb)::text;
        RESET ROLE;
        SELECT 'ledger='||count(*) FROM ppg_xp_ledger
         WHERE learner_id = '${seededIds.learner64110001}'
           AND event_type = 'knowledge_mission_pass' AND event_ref = 'module-01';
        SELECT 'amount='||amount FROM ppg_xp_ledger
         WHERE learner_id = '${seededIds.learner64110001}'
           AND event_type = 'knowledge_mission_pass' AND event_ref = 'module-01';
      ROLLBACK;`,
    )
    expect(probe(out, 'first').includes('"outcome": "pass"')).toBe(true)
    expect(probe(out, 'first').includes('"xp_granted": 100')).toBe(true)
    // the replay: `xp_granted` 0 (what actually landed); the retry ADDS an
    // ATTEMPT row (attempt_seq 2 — unlimited retries), NO ledger row.
    const replay = probe(out, 'replay')
    expect(replay.includes('"outcome": "pass"')).toBe(true)
    expect(replay.includes('"xp_granted": 0')).toBe(true)
    expect(replay.includes('"attempt_seq": 2')).toBe(true)
    // ONE ledger row for the Mission's pass: the SUM the header reads is
    // 100, never 200 (the PK the idempotency authority).
    expect(probe(out, 'ledger')).toBe('1')
    expect(probe(out, 'amount')).toBe('100')
  },
)

test(
  'Unlock server-side: a learner who completed module-01 Mission sees module-02 LOCKED before the `complete` row lands, and OPEN after it (the linear rule reads the completion — the client cannot bypass)',
  { skip: !hasLocalStack },
  () => {
    // BEFORE the pass: module-02's lessons stay server-side INVISIBLE —
    // the RLS deny is SILENT (`[]`, no error; an owner count proves the
    // rows exist, so the empty read is the deny, not an empty module).
    // The baseline cleans the placeholder/`complete` row in-tx.
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        DELETE FROM ppg_module_missions
         WHERE learner_id = '${seededIds.learner64110001}' AND module_key = 'module-01';
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '${SC_PASS}'::jsonb);
        SELECT ppg_check_self_check('module-01-lesson-02', '${SC_PASS}'::jsonb);
        SELECT 'before='||ppg_module_lessons('module-02')::text;
        RESET ROLE;
        SELECT 'lockedrows='||count(*) FROM ppg_lessons WHERE module_key = 'module-02';
        ${asRole('learner', seededIds.learner64110001)}
        SELECT 'pass='||ppg_submit_mission('module-01', '${ALL_A}'::jsonb)::text;
        SELECT 'after='||ppg_module_lessons('module-02')::text;
      ROLLBACK;`,
    )
    // the locked read is the silent `[]` (never a smuggled lesson row)…
    expect(probe(out, 'before')).toBe('[]')
    // …while the module HAS lesson rows (the owner read under RLS bypass).
    expect(probe(out, 'lockedrows')).toBe('1')

    // AFTER the Mission pass: the completion hook UPSERTs `complete` — the
    // SAME linear rule the #9/#10 function reads now honors the real row
    // (module-02 opens server-side; a client UPDATE of the status is NEVER
    // the authority — no UPDATE policy exists; the client cannot bypass).
    expect(probe(out, 'pass').includes('"outcome": "pass"')).toBe(true)
    expect(probe(out, 'after').includes('module-02-lesson-01')).toBe(true)
  },
)

test(
  'History: the score history retained append-only (unlimited retries ADD attempt rows; the PK stamps the retry count; the score retained per learner+mission)',
  { skip: !hasLocalStack },
  () => {
    // The fail attempt, then a pass: TWO attempt rows for the learner's
    // `module-01` Mission (the PK (learner_id, module_key, attempt_seq)
    // stamps the retry count; the score history retained).
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '${SC_PASS}'::jsonb);
        SELECT ppg_check_self_check('module-01-lesson-02', '${SC_PASS}'::jsonb);
        SELECT 'failed='||ppg_submit_mission('module-01', '${ONE_RIGHT}'::jsonb)::text;
        SELECT 'passed='||ppg_submit_mission('module-01', '${ALL_A}'::jsonb)::text;
        SELECT 'attempts='||count(*) FROM ppg_mission_attempts
         WHERE learner_id = auth.uid() AND module_key = 'module-01';
        SELECT 'history='||ppg_mission_history('module-01')::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'failed').includes('"outcome": "fail"')).toBe(true)
    expect(probe(out, 'failed').includes('"score_pct": 33')).toBe(true)
    expect(probe(out, 'passed').includes('"outcome": "pass"')).toBe(true)
    // TWO rows for the learner's Mission (the append-only stream the
    // retries grew). The scores retained (the read the page shows).
    expect(probe(out, 'attempts')).toBe('2')
    const history = probe(out, 'history')
    expect(history.includes('"score_pct": 33')).toBe(true)
    expect(history.includes('"score_pct": 100')).toBe(true)
    expect(history.includes('"attempt_seq": 1')).toBe(true)
    expect(history.includes('"attempt_seq": 2')).toBe(true)
  },
)

test(
  'Badge once: the module badge awarded EXACTLY ONCE on the first pass (the award PK — a second pass adds NO module_01_mission row); the gallery shows earned/locked with criteria (bilingual)',
  { skip: !hasLocalStack },
  () => {
    // The FIRST pass awards the module badge (`badge_granted` true); the
    // SECOND pass may NOT award it again (a duplicate award the PK denies;
    // `badge_granted` false on the second call). The award counts ride the
    // OWNER read (RLS bypassed); the gallery is the learner's own.
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        DELETE FROM ppg_badge_awards WHERE learner_id = '${seededIds.learner64110001}';
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_check_self_check('module-01-lesson-01', '${SC_PASS}'::jsonb);
        SELECT ppg_check_self_check('module-01-lesson-02', '${SC_PASS}'::jsonb);
        SELECT 'first='||ppg_submit_mission('module-01', '${ALL_A}'::jsonb)::text;
        SELECT 'second='||ppg_submit_mission('module-01', '${ALL_A}'::jsonb)::text;
        RESET ROLE;
        SELECT 'modawards='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${seededIds.learner64110001}' AND badge_key = 'module_01_mission';
        SELECT 'readyawards='||count(*) FROM ppg_badge_awards
         WHERE learner_id = '${seededIds.learner64110001}' AND badge_key = 'mission_ready';
        ${asRole('learner', seededIds.learner64110001)}
        SELECT 'gallery='||ppg_badge_gallery()::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'first').includes('"badge_granted": true')).toBe(true)
    expect(probe(out, 'second').includes('"badge_granted": false')).toBe(true)
    // ONE award row for the learner's `module_01_mission` badge (a real
    // achievement's record, never a fake award).
    expect(probe(out, 'modawards')).toBe('1')
    // the Mission Ready badge rides the FIRST Self-Check pass (the #11
    // award in the #10 transaction) and stays ONE after two passes.
    expect(probe(out, 'readyawards')).toBe('1')

    // The gallery: the badge_types taxonomy (the criteria the copy shown)
    // + the CALLER's earned/locked — the earned badge says `true` + the
    // event_ref; a locked badge says `false` + the criteria stay VISIBLE
    // (the bilingual award_rule columns).
    const gallery = probe(out, 'gallery')
    expect(gallery.includes('"criteria_th"') && gallery.includes('"criteria_en"')).toBe(true)
    expect(gallery.includes('"badge_key": "module_01_mission"')).toBe(true)
    expect(gallery.includes('"earned": true')).toBe(true)
    expect(gallery.includes('"badge_key": "mission_ready"')).toBe(true)
    expect(gallery.includes('"award_event": "self_check_pass"')).toBe(true)
    // a still-locked badge rides the SAME read with the criteria VISIBLE.
    expect(gallery.includes('"badge_key": "module_02_mission"')).toBe(true)
    expect(gallery.includes('"earned": false')).toBe(true)
  },
)
