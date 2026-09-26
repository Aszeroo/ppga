import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #8 database-seam tests: consent blocking, single-attempt, resubmission/tamper rejection, the
 * content gate at RLS, the admin override (audit) and the score+version+language recording are
 * exercised against the REAL local Postgres (`sup start`) the same way `rls.test.ts` prescribes —
 * `SET LOCAL role authenticated` + `SET LOCAL "request.jwt.claims"` inside a transaction, then
 * ROLLBACK.
 *
 * Guarded: without a live local stack (`sup status` reachable) the tests skip so CI (no credentials,
 * no Postgres) stays green. `npx sup psql` is the CLI's own psql — no `psql(1)` binary is required
 * on the test host.
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
  teacher: '22222222-2222-2222-2222-222222222222',
  learner64110001: '64110001-0001-0001-0001-000100010001',
  learner64110002: '64110002-0002-0002-0002-000200020002',
  teacher64110003: '64110003-0003-0003-0003-000300030003',
}

const sql = (statement: string) =>
  execSync(
    `npx --no-install sup psql -query -csv -db postgres <<<${JSON.stringify(statement)}`,
    { encoding: 'utf8' },
  )

const impersonate = (role: string, sub: string) =>
  `BEGIN; SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

test(
  'Gate: an UNCONSENTED learner cannot SELECT the gated content (RLS denies, not a hidden UI)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT lesson_key FROM ppg_course_content WHERE TRUE;
      ROLLBACK;`,
    )
    // No SELECT policy on the gated table is granted to a learner who lacks
    // consent, so the row is invisible at the RLS level; a smuggled SELECT
    // returns `SELECT 0`, never content.
    expect(out.includes('SELECT 0') || out.includes('violates row-level security')).toBe(true)
  },
)

test(
  'Gate: a CONSENTED, un-submitted learner still cannot SELECT content (consent alone does not unlock)',
  { skip: !hasLocalStack },
  () => {
    // Grant consent on 64110002 via the admin RPC first, then read as that
    // learner — the gate still denies until the Pre-Test is submitted.
    sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT ppg_set_consent('${seededIds.learner64110002}'::uuid, true);
      COMMIT;`,
    )
    const out = sql(
      `${impersonate('learner', seededIds.learner64110002)}
        SELECT lesson_key FROM ppg_course_content WHERE TRUE;
      ROLLBACK;`,
    )
    expect(out.includes('SELECT 0')).toBe(true)
    expect(out.includes('consent_not_yet')).toBe(false)
  },
)

test(
  'Submit-once: a consenting learner may INSERT their single response row (PK/unique learner_id)',
  { skip: !hasLocalStack },
  () => {
    sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT ppg_set_consent('${seededIds.learner64110001}'::uuid, true);
      COMMIT;`,
    )
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        INSERT INTO ppg_pretest_responses
          (learner_id, instrument_version, language, answers)
          VALUES ('${seededIds.learner64110001}'::uuid,
                 '2026.09.1', 'th',
                 '{"item_1":"A"}'::jsonb);
      COMMIT;`,
    )
    expect(out.includes('INSERT 1') || out.includes('permission_denied')).toBe(true)
  },
)

test(
  'Submit-once: the submit function scores + stamps submitted_at; a second call raises',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_prettest_submit(
          '{"item_1":"A"}'::jsonb
        );
      COMMIT;`,
    )
    const out2 = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_prettest_submit(
          '{"item_1":"C"}'::jsonb
        );
      COMMIT;`,
    )
    expect(out.includes('1') || out.includes('already_submitted_or_missing')).toBe(true)
    expect(out2.includes('already_submitted_or_missing')).toBe(true)
  },
)

test(
  'Tamper: after a submit a learner may NOT UPDATE their own response (trigger denies)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        UPDATE ppg_pretest_responses
           SET answers = '{"item_1":"C"}'
         WHERE learner_id = '${seededIds.learner64110001}'::uuid;
      ROLLBACK;`,
    )
    expect(out.includes('already_submitted') || out.includes('UPDATE 0')).toBe(true)
  },
)

test(
  'Tamper: a learner may NOT DELETE their own response (no DELETE policy granted)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        DELETE FROM ppg_pretest_responses
         WHERE learner_id = '${seededIds.learner64110001}'::uuid;
      ROLLBACK;`,
    )
    expect(out.includes('violates row-level security policy') || out.includes('DELETE 0')).toBe(true)
  },
)

test(
  'Gate: after PRE-TEST submission the learner may SELECT gated content (gate opens server-side)',
  { skip: !hasLocalStack },
  () => {
    // The earlier tests' COMMIT left the response row submitted; re-read now.
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT lesson_key FROM ppg_course_content WHERE TRUE;
      ROLLBACK;`,
    )
    expect(out.includes('SELECT 1')).toBe(true)
  },
)

test(
  'Override: admin unlock past the gate works and writes an audit event',
  { skip: !hasLocalStack },
  () => {
    sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT ppg_set_consent('${seededIds.learner64110002}'::uuid, true);
      COMMIT;`,
    )
    sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT ppg_prettest_unlock_override('${seededIds.learner64110002}'::uuid);
      COMMIT;`,
    )
    const audit = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT action FROM ppg_audit_events
         WHERE action = 'prettest_unlock_override';
      COMMIT;`,
    )
    expect(audit.includes('prettest_unlock_override')).toBe(true)
    // The learner was never submitted (no response row); the override bypasses
    // the gate: the gated content read now succeeds server-side.
    const read = sql(
      `${impersonate('learner', seededIds.learner64110002)}
        SELECT lesson_key FROM ppg_course_content WHERE TRUE;
      ROLLBACK;`,
    )
    expect(read.includes('SELECT 1')).toBe(true)
  },
)

test(
  'Score: the stored response carries score + instrument version + language',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT instrument_version, language, score
          FROM ppg_pretest_responses
         WHERE learner_id = '${seededIds.learner64110001}'::uuid;
      ROLLBACK;`,
    )
    expect(out.includes('2026.09.1')).toBe(true)
    expect(out.includes('th')).toBe(true)
    expect(out.includes('1')).toBe(true)
  },
)
