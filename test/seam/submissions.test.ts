import { test, expect } from 'vitest'
import { execSync } from 'node:child_process'

/**
 * Ticket #13 database-seam tests: the Practical Mission submission lifecycle is
 * exercised against the REAL local Postgres (`supabase start`) the same way the
 * `rls.test.ts`/`missions.test.ts` seam tests prescribe it — `SET LOCAL role
 * authenticated` + `SET LOCAL "request.jwt.claims"` (the learner/teacher/admin
 * JWT is the policy/function's authority; `sub` is the account's `auth.users.id`
 * seeded by `20260925000110_seeds.sql`) inside a transaction, then ROLLBACK.
 *
 * The authority here: the cross-learner denial rides the `ppg_submissions_insert`
 * CHECK policy (a stranger's row NEVER lands; the `ppg_insert_submission` definer
 * carries the caller-own uid check); the append-only history rides the RLS
 * default-deny of a command WITHOUT a policy + the `ppg_submissions_append_only`
 * /`append_only_delete` triggers (a past row NEVER moves, NEVER disappears —
 * ADR-0002); the status lifecycle rides `ppg_set_submission_status` (the definer
 * moves `in_progress->submitted`, `submitted->needs_improvement|approved`,
 * `needs_improvement->approved`; ANY OTHER pair rides `invalid_transition`; a
 * teacher/admin NEVER sets a learner row status — `denied_role`; a stranger
 * smuggle rides `denied_caller`); the ~60s signed-URL download rides
 * `ppg_signed_url_for` (the owner row + a teacher/admin read; a stranger row
 * NEVER yields a URL — `denied_or_missing`).
 *
 * Guarded: without a live local stack (`supabase status` reachable) the tests
 * skip so CI (no credentials, no Postgres) stays green. `npx supabase psql` is
 * the CLI's own psql — no `psql(1)` binary is required on the test host.
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
  learnerA: '64110001-0001-0001-0001-000100010001',
  learnerB: '64110002-0002-0002-0002-000200020002',
}

const sql = (statement: string) =>
  execSync(
    `docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`,
    { input: statement, encoding: 'utf8' },
  )

const impersonate = (role: string, sub: string) =>
  `BEGIN; SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

const ownPath = (learnerId: string, seq: number) =>
  `submissions/${learnerId}/module-08/${seq}`

test(
  'RLS: a stranger INSERT of another learner submission row NEVER lands (the check policy denies the foreign row)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        INSERT INTO ppg_submissions
          (learner_id, mission_id, submission_seq, storage_path, file_magic, file_size, reflection, status)
        VALUES ('${seededIds.learnerB}', 'module-08', 1,
          'submissions/${seededIds.learnerB}/module-08/1', 'pptx', 1000, 'x', 'in_progress');
      ROLLBACK;`,
    )
    // The `ppg_submissions_insert` CHECK (learner AND own uid) denies the
    // foreign row with a hard RLS error — Postgres names the TABLE in the raise
    // (`for table "ppg_submissions"`), never the specific policy.
    expect(out.includes('violates row-level security policy')).toBe(true)
    expect(out.includes('ppg_submissions')).toBe(true)
  },
)

test(
  'Append-only: a past submission NEVER moves by a hand replay update (ADR-0002 — the file + the reflection NEVER ride a replay update)',
  { skip: !hasLocalStack },
  () => {
    // The append-only TRIGGER is the ADR-0002 last line of defense: it fires
    // only if RLS doesn't FIRST hide the row. As a bare learner there is NO
    // update policy (RLS default-deny moves 0 rows SILENTLY, no error), so the
    // hand replay must ride the OWNER (RLS bypassed, `RESET ROLE`) for the
    // BEFORE UPDATE deny trigger to speak — mirroring `review.test.ts`. The row
    // is seeded through the learner's OWN definer insert RPC.
    const out = sql(
      `BEGIN;
        DELETE FROM ppg_submissions WHERE learner_id = '${seededIds.learnerA}' AND mission_id = 'module-08' AND submission_seq = 901;
        SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learnerA}"}';
        SELECT * FROM ppg_insert_submission('${seededIds.learnerA}'::uuid, 'module-08', 901,
          '${ownPath(seededIds.learnerA, 901)}', 'pptx', 1000, 'a short reflection');
        RESET ROLE; -- the hand replay rides the OWNER (RLS bypassed) so the trigger fires
        UPDATE ppg_submissions
         SET reflection = 'a hand replay update'
         WHERE learner_id = '${seededIds.learnerA}'
           AND mission_id = 'module-08'
           AND submission_seq = 901;
      ROLLBACK;`,
    )
    expect(out.includes('append_only_submission_immutable_denied')).toBe(true)
  },
)

test(
  'Append-only: a past submission NEVER disappears (ADR-0002 — DELETE rides the default-deny + the before-delete trigger)',
  { skip: !hasLocalStack },
  () => {
    // As a bare learner there is NO delete policy (RLS default-deny deletes 0
    // rows SILENTLY, no error), so the hand delete must ride the OWNER
    // (`RESET ROLE`) for the BEFORE DELETE deny trigger to fire — the ADR-0002
    // last line of defense. The row rides the learner's OWN definer insert RPC.
    const out = sql(
      `BEGIN;
        DELETE FROM ppg_submissions WHERE learner_id = '${seededIds.learnerA}' AND mission_id = 'module-08' AND submission_seq = 902;
        SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learnerA}"}';
        SELECT * FROM ppg_insert_submission('${seededIds.learnerA}'::uuid, 'module-08', 902,
          '${ownPath(seededIds.learnerA, 902)}', 'pptx', 1000, 'a short reflection');
        RESET ROLE; -- the hand delete rides the OWNER (RLS bypassed) so the trigger fires
        DELETE FROM ppg_submissions
         WHERE learner_id = '${seededIds.learnerA}'
           AND mission_id = 'module-08'
           AND submission_seq = 902;
      ROLLBACK;`,
    )
    expect(out.includes('append_only_submission_delete_denied')).toBe(true)
  },
)

test(
  'Lifecycle: the own insert + the legal move in_progress to submitted ride (the definer carries the own uid check)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT * FROM ppg_insert_submission
          ('${seededIds.learnerA}'::uuid, 'module-08', 1,
          '${ownPath(seededIds.learnerA, 1)}', 'pptx', 1000, 'a short reflection');
        SELECT * FROM ppg_set_submission_status
          ('${seededIds.learnerA}'::uuid, 'module-08', 1, 'submitted'::ppg_submission_status);
      ROLLBACK;`,
    )
    expect(!out.includes('invalid_transition')).toBe(true)
    expect(!out.includes('denied_caller')).toBe(true)
    expect(out.includes('submitted')).toBe(true)
  },
)

test(
  'Lifecycle: an illegal move in_progress to approved NEVER moves the status (invalid_transition denies)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT * FROM ppg_insert_submission
          ('${seededIds.learnerA}'::uuid, 'module-08', 1,
          '${ownPath(seededIds.learnerA, 1)}', 'pptx', 1000, 'a short reflection');
        SELECT * FROM ppg_set_submission_status
          ('${seededIds.learnerA}'::uuid, 'module-08', 1, 'approved'::ppg_submission_status);
      ROLLBACK;`,
    )
    expect(out.includes('invalid_transition')).toBe(true)
  },
)

test(
  'Lifecycle: a stranger smuggle NEVER sets another learner status (denied_caller denies the definer own-uid check)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerB)}
        SELECT * FROM ppg_set_submission_status
          ('${seededIds.learnerA}'::uuid, 'module-08', 1, 'submitted'::ppg_submission_status);
      ROLLBACK;`,
    )
    expect(out.includes('denied_caller')).toBe(true)
  },
)

test(
  'Lifecycle: a teacher NEVER sets a learner status (denied_role denies the review seam at ticket #14 own write)',
  { skip: !hasLocalStack },
  () => {
    // A teacher's DIRECT call NEVER moves a learner's row. The row is seeded
    // `submitted` (so `submitted->approved` is a LEGAL pair that WOULD land if
    // the role seam leaked); the teacher's call rides the documented
    // `denied_role` guard (teacher/admin on a stranger's row WITHOUT the
    // review's own ppg.rerun flag) and the new status NEVER returns.
    const out = sql(
      `BEGIN;
        DELETE FROM ppg_submissions WHERE learner_id = '${seededIds.learnerA}' AND mission_id = 'module-08' AND submission_seq = 903;
        INSERT INTO ppg_submissions
          (learner_id, mission_id, submission_seq, storage_path, file_magic, file_size, reflection, status)
        VALUES ('${seededIds.learnerA}', 'module-08', 903,
          '${ownPath(seededIds.learnerA, 903)}', 'pptx', 1000, 'x', 'submitted');
        SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
        SELECT * FROM ppg_set_submission_status
          ('${seededIds.learnerA}'::uuid, 'module-08', 903, 'approved'::ppg_submission_status);
      ROLLBACK;`,
    )
    expect(out.includes('denied_role')).toBe(true)
    expect(out.includes('approved')).toBe(false)
  },
)

test(
  'Signed URL: the own download rides the ~60s expiry (the private bucket NEVER rides a public read)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT * FROM ppg_insert_submission
          ('${seededIds.learnerA}'::uuid, 'module-08', 1,
          '${ownPath(seededIds.learnerA, 1)}', 'pptx', 1000, 'a short reflection');
        SELECT * FROM ppg_signed_url_for('module-08', 1, 60);
      ROLLBACK;`,
    )
    expect(out.includes('token')).toBe(true)
    expect(out.includes('expires=60')).toBe(true)
    expect(out.includes(`submissions/${seededIds.learnerA}/module-08/1`)).toBe(true)
  },
)

test(
  'Signed URL: a teacher/admin MAY download a learner file (the read gate carries the teacher role)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT * FROM ppg_insert_submission
          ('${seededIds.learnerA}'::uuid, 'module-08', 1,
          '${ownPath(seededIds.learnerA, 1)}', 'pptx', 1000, 'a short reflection');
        SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
        SELECT * FROM ppg_signed_url_for('module-08', 1, 60);
      ROLLBACK;`,
    )
    expect(out.includes('token')).toBe(true)
    expect(out.includes('expires=60')).toBe(true)
  },
)

test(
  'Signed URL: a stranger NEVER downloads another learner file (denied_or_missing denies at the row)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerB)}
        SELECT * FROM ppg_signed_url_for('module-08', 1, 60);
      ROLLBACK;`,
    )
    expect(out.includes('denied_or_missing')).toBe(true)
  },
)
