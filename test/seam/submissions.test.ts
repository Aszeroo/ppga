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
    `npx --no-install supabase psql -query -csv -db postgres <<<${JSON.stringify(statement)}`,
    { encoding: 'utf8' },
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
    expect(out.includes('violates row-level security policy')).toBe(true)
    expect(out.includes('ppg_submissions_insert')).toBe(true)
  },
)

test(
  'Append-only: a past submission NEVER moves by a hand replay update (ADR-0002 — the file + the reflection NEVER ride a replay update)',
  { skip: !hasLocalStack },
  () => {
    // the own learner own row: the replay update rides the RLS default-deny
    // (no update policy exists) + the append-only trigger the definer NEVER
    // speaks by hand.
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        UPDATE ppg_submissions
         SET reflection = 'a hand replay update'
         WHERE learner_id = '${seededIds.learnerA}'
           AND mission_id = 'module-08'
           AND submission_seq = 1;
      ROLLBACK;`,
    )
    expect(out.includes('violates row-level security policy')).toBe(true)
  },
)

test(
  'Append-only: a past submission NEVER disappears (ADR-0002 — DELETE rides the default-deny + the before-delete trigger)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        DELETE FROM ppg_submissions
         WHERE learner_id = '${seededIds.learnerA}'
           AND mission_id = 'module-08'
           AND submission_seq = 1;
      ROLLBACK;`,
    )
    expect(out.includes('violates row-level security policy')).toBe(true)
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
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT * FROM ppg_set_submission_status
          ('${seededIds.learnerA}'::uuid, 'module-08', 1, 'approved'::ppg_submission_status);
      ROLLBACK;`,
    )
    expect(out.includes('denied_role')).toBe(true)
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
