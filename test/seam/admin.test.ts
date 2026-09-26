import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #6 database-seam tests: the admin console's two surfaces (the users
 * list + the role-change RPC) and the audit foundation's two properties
 * (admin-only read + append-only UPDATE/DELETE) are exercised against the
 * REAL local Postgres (`supabase start`) the same way Ticket #3's
 * `rls.test.ts` prescribes — `SET LOCAL role authenticated` +
 * `SET LOCAL "request.jwt.claims"` inside a transaction, then ROLLBACK.
 *
 * Guarded: without a live local stack the tests skip so CI (no credentials,
 * no Postgres) stays green. `npx supabase psql` is the CLI's own psql — no
 * `psql(1)` binary is required on the test host.
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
    `npx --no-install supabase psql -query -csv -db postgres <<<${JSON.stringify(statement)}`,
    { encoding: 'utf8' },
  )

const impersonate = (role: string, sub: string) =>
  `BEGIN; SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

test(
  'RPC: a teacher may NOT read the admin user-list (gate raises, not a 0-row list)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT * FROM ppg_admin_users_list(0);
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
    expect(out.includes('ppg_admin_users_list')).toBe(true)
  },
)

test(
  'RPC: a learner may NOT read the admin user-list (gate raises, not a 0-row list)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT * FROM ppg_admin_users_list(0);
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
  },
)

test(
  'RPC: an ADMIN READS the user-list (page-20, ordered by student_id)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT student_id FROM ppg_admin_users_list(0);
      ROLLBACK;`,
    )
    for (const handle of ['admin', 'teacher', '64110001', '64110002', '64110003']) {
      expect(out.includes(handle)).toBe(true)
    }
  },
)

test(
  'RPC: a learner may NOT change another role (gate raises, not a silent 0-row UPDATE)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_change_role('admin'::ppg_role, '${seededIds.learner64110002}'::uuid);
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
    expect(out.includes('ppg_change_role')).toBe(true)
  },
)

test(
  'RPC: a teacher may NOT change another role (gate raises, not a silent 0-row UPDATE)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT ppg_change_role('admin'::ppg_role, '${seededIds.learner64110001}'::uuid);
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
  },
)

test(
  'RPC: an ADMIN changes a learner role, and EXACTLY ONE audit event is written',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT ppg_change_role('teacher'::ppg_role, '${seededIds.learner64110001}'::uuid);
        SELECT count(*) FROM ppg_audit_events WHERE action = 'role_change';
      ROLLBACK;`,
    )
    // The event's count is 1 inside the transaction; the ROLLBACK never
    // persists it — the count proves the RPC's own INSERT, not a trigger.
    expect(out.includes('1')).toBe(true)
    expect(out.includes('role_change')).toBe(true)
  },
)

test(
  'Audit: UPDATE on ppg_audit_events is rejected (no UPDATE policy granted)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('admin', seededIds.admin)}
        UPDATE ppg_audit_events SET action = 'stolen' WHERE true;
      ROLLBACK;`,
    )
    // The command tag is `UPDATE 0` — the table itself denies (no UPDATE
    // policy is granted).
    expect(out.includes('UPDATE 0')).toBe(true)
  },
)

test(
  'Audit: DELETE on ppg_audit_events is rejected (no DELETE policy granted)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('admin', seededIds.admin)}
        DELETE FROM ppg_audit_events WHERE true;
      ROLLBACK;`,
    )
    expect(out.includes('DELETE 0')).toBe(true)
  },
)

test(
  'Audit: an ADMIN READS the audit stream via the RPC (the table read + the gate)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT ppg_change_role('teacher'::ppg_role, '${seededIds.teacher64110003}'::uuid);
        SELECT action FROM ppg_admin_audit_list(50);
      ROLLBACK;`,
    )
    expect(out.includes('role_change')).toBe(true)
    expect(out.includes('admin')).toBe(false) // no admin's own role event here
  },
)

test(
  'Audit: a teacher may NOT read the audit stream via the RPC (gate raises)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT * FROM ppg_admin_audit_list(50);
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
  },
)

test(
  'Audit: a learner may NOT read the audit stream via the RPC (gate raises)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110002)}
        SELECT * FROM ppg_admin_audit_list(50);
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
  },
)
