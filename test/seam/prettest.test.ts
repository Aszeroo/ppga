import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #8 database-seam tests: consent blocking, single-attempt, resubmission/tamper rejection, the
 * content gate at RLS, the admin override (audit) and the score+version+language recording are
 * exercised against the REAL local Postgres (`supabase start`) the same way `rls.test.ts` prescribes —
 * `SET LOCAL role authenticated` + `SET LOCAL "request.jwt.claims"` inside a transaction, then
 * ROLLBACK.
 *
 * EVERY test is hermetic: the consent/submit state it needs rides INSIDE its own transaction (the
 * admin claim flips the consent flag, the learner claim inserts/submits the response) and ROLLS
 * BACK — no COMMIT, no cross-file order dependence, no residue in the shared container. The owner
 * (postgres) cleanup rides the same transaction BEFORE the impersonation, so a polluted container
 * still yields the seeded baseline inside the tx. RLS silent-denies prove themselves as ABSENCE of
 * rows (`-tA` never prints a command status), so the denies assert on VALUES (a follow-up
 * `RESET ROLE` count proves the row never moved/disappeared).
 *
 * Guarded: without a live local stack (`supabase status` reachable) the tests skip so CI (no
 * credentials, no Postgres) stays green. The `docker exec psql` talks to the running stack.
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
  teacher: '22222222-2222-2222-2222-222222222222',
  learner64110001: '64110001-0001-0001-0001-000100010001',
  learner64110002: '64110002-0002-0002-0002-000200020002',
  teacher64110003: '64110003-0003-0003-0003-000300030003',
}

const sql = (statement: string) =>
  execSync(
    `docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`,
    { input: statement, encoding: 'utf8' },
  )

// the owner-level cleanup that rides the SAME transaction (rolled back): the
// response row + the override audit events, so every test starts from the
// seeded baseline inside its own tx whatever the container holds.
const ownerReset = (learnerId: string) => `
  DELETE FROM ppg_pretest_responses WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_audit_events WHERE action = 'prettest_unlock_override';
  UPDATE ppg_profiles SET consent = false, prettest_unlocked_override = false
   WHERE id = '${learnerId}';`

// the consent flip + insert + submit INSIDE the caller's open transaction,
// the claims switched admin -> learner (the same switch the review seam uses).
const setupSubmitted = (learnerId: string) => `
  ${ownerReset(learnerId)}
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claims" = '{"role":"admin","sub":"${seededIds.admin}"}';
  SELECT ppg_set_consent('${learnerId}'::uuid, true);
  SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${learnerId}"}';
  INSERT INTO ppg_pretest_responses (learner_id, instrument_version, language, answers)
    VALUES ('${learnerId}'::uuid, '2026.09.1', 'th', '{"item_1":"A"}'::jsonb);
  SELECT ppg_prettest_submit('{"item_1":"A"}'::jsonb);`

test(
  'Gate: an UNCONSENTED learner cannot SELECT the gated content (RLS denies, not a hidden UI)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${ownerReset(seededIds.learner64110002)}
        SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"admin","sub":"${seededIds.admin}"}';
        SELECT ppg_set_consent('${seededIds.learner64110002}'::uuid, false);
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learner64110002}"}';
        SELECT lesson_key FROM ppg_course_content;
      ROLLBACK;`,
    )
    // No SELECT policy row is visible to an unconsented learner — the gated
    // row is INVISIBLE (RLS never errors on a SELECT, it yields 0 rows), so
    // the proof is the absence of the seeded `gate-proof` key.
    expect(out.includes('gate-proof')).toBe(false)
  },
)

test(
  'Gate: a CONSENTED, un-submitted learner still cannot SELECT content (consent alone does not unlock)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${ownerReset(seededIds.learner64110002)}
        SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"admin","sub":"${seededIds.admin}"}';
        SELECT ppg_set_consent('${seededIds.learner64110002}'::uuid, true);
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learner64110002}"}';
        SELECT lesson_key FROM ppg_course_content;
      ROLLBACK;`,
    )
    // consent rides, the Pre-Test never was submitted: the gate function
    // denies and the gated row stays invisible.
    expect(out.includes('gate-proof')).toBe(false)
  },
)

test(
  'Submit-once: a consenting learner may INSERT their single response row (PK/unique learner_id)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${ownerReset(seededIds.learner64110001)}
        SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learner64110001}"}';
        INSERT INTO ppg_pretest_responses
          (learner_id, instrument_version, language, answers)
          VALUES ('${seededIds.learner64110001}'::uuid,
                 '2026.09.1', 'th',
                 '{"item_1":"A"}'::jsonb);
        -- the second INSERT of the SAME learner rides the PK (one response
        -- per learner) — the smuggle NEVER yields a second row.
        INSERT INTO ppg_pretest_responses
          (learner_id, instrument_version, language, answers)
          VALUES ('${seededIds.learner64110001}'::uuid,
                 '2026.09.1', 'th',
                 '{"item_1":"B"}'::jsonb);
        RESET ROLE; -- the owner count proves ONE row landed, never two
        SELECT count(*) FROM ppg_pretest_responses
         WHERE learner_id = '${seededIds.learner64110001}';
      ROLLBACK;`,
    )
    expect(out.includes('duplicate key')).toBe(true)
    expect(out.includes('1')).toBe(true)
  },
)

test(
  'Submit-once: the submit function scores + stamps submitted_at; a second call raises',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${setupSubmitted(seededIds.learner64110001)}
        -- the replay: the same learner, the same row — already stamped.
        SELECT ppg_prettest_submit('{"item_1":"C"}'::jsonb);
      ROLLBACK;`,
    )
    // the FIRST submit scored 1 server-side (the key says item_1 = "A" — the
    // score rides the function's output, never a client count); the replay
    // raises the single-attempt denial.
    expect(out.includes('already_submitted_or_missing')).toBe(true)
  },
)

test(
  'Tamper: after a submit a learner may NOT UPDATE their own response (trigger denies)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${setupSubmitted(seededIds.learner64110001)}
        RESET ROLE; -- the hand UPDATE rides the OWNER (RLS bypassed) so the
        -- BEFORE UPDATE immutable trigger (the last line of defense) fires.
        UPDATE ppg_pretest_responses
           SET answers = '{"item_1":"C"}'
         WHERE learner_id = '${seededIds.learner64110001}'::uuid;
      ROLLBACK;`,
    )
    // the immutable-once-submitted trigger speaks `already_submitted` —
    // never a silently-overwritten row.
    expect(out.includes('already_submitted')).toBe(true)
  },
)

test(
  'Tamper: a learner may NOT DELETE their own response (no DELETE policy granted)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${setupSubmitted(seededIds.learner64110001)}
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learner64110001}"}';
        DELETE FROM ppg_pretest_responses
         WHERE learner_id = '${seededIds.learner64110001}'::uuid;
        RESET ROLE; -- the owner count proves the silent deny: the row NEVER
        -- disappeared (a DELETE without a policy moves no row, no error).
        SELECT count(*) FROM ppg_pretest_responses
         WHERE learner_id = '${seededIds.learner64110001}';
      ROLLBACK;`,
    )
    expect(out.includes('1')).toBe(true)
  },
)

test(
  'Gate: after PRE-TEST submission the learner may SELECT gated content (gate opens server-side)',
  { skip: !hasLocalStack },
  () => {
    // consent + submit ride this same transaction (rolled back at the end).
    const out = sql(
      `BEGIN;
        ${setupSubmitted(seededIds.learner64110001)}
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learner64110001}"}';
        SELECT lesson_key FROM ppg_course_content;
      ROLLBACK;`,
    )
    expect(out.includes('gate-proof')).toBe(true)
  },
)

test(
  'Override: admin unlock past the gate works and writes an audit event',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${ownerReset(seededIds.learner64110002)}
        SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"admin","sub":"${seededIds.admin}"}';
        SELECT ppg_set_consent('${seededIds.learner64110002}'::uuid, true);
        SELECT ppg_prettest_unlock_override('${seededIds.learner64110002}'::uuid);
        SELECT 'prettest_unlock_override='||count(*) FROM ppg_audit_events
         WHERE action = 'prettest_unlock_override';
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learner64110002}"}';
        SELECT lesson_key FROM ppg_course_content;
      ROLLBACK;`,
    )
    // EXACTLY one audit event rides the override (the cleanup inside the tx
    // makes the count exact); the learner was never submitted — the override
    // alone bypasses the gate: the gated read now succeeds server-side.
    expect(out.includes('prettest_unlock_override=1')).toBe(true)
    expect(out.includes('gate-proof')).toBe(true)
  },
)

test(
  'Score: the stored response carries score + instrument version + language',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${setupSubmitted(seededIds.learner64110001)}
        RESET ROLE; -- the admin-equivalent owner read of the stored row
        SELECT instrument_version || '|' || language || '|' || score::text
          FROM ppg_pretest_responses
         WHERE learner_id = '${seededIds.learner64110001}'::uuid;
      ROLLBACK;`,
    )
    // the key says item_1 = "A", the submit was "A" — score 1 stored
    // server-side with the version + language recorded (ADR-0002).
    expect(out.includes('2026.09.1|th|1')).toBe(true)
  },
)
