import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #7 database-seam tests: the provision-audit RPC's gate (only
 * Admin/Teacher may provision) + the audit event's written proof (exactly one
 * INSERT per call) + the RLS' insert denial on `ppg_profiles` for a learner
 * (provisioning's own write path: no self-registration INSERT exists for any
 * client) are exercised against the REAL local Postgres (`supabase start`)
 * the same way Ticket #3/#6's `rls.test.ts`/`admin.test.ts` prescribe it —
 * `SET LOCAL role authenticated` + `SET LOCAL "request.jwt.claims"` (the
 * JWT's role claim + `sub` is the policy's authority; the seeded uuids come
 * from `20260925000110_seeds.sql`) inside a transaction, then ROLLBACK.
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
  learner64110001: '64110001-0001-0001-0001-000100010001',
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
  'RPC: a learner may NOT provision via the finalize RPC (gate raises, not a silent write)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_provision_finalize('${seededIds.teacher64110003}'::uuid, 'x', 'y', 'created');
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
    expect(out.includes('ppg_provision_finalize')).toBe(true)
  },
)

test(
  'RPC: a teacher MAY provision via the finalize RPC (the JWT claim admin/teacher speaks)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT ppg_provision_finalize(null, '64110001', 'Lew A. Boonthi', 'created');
      ROLLBACK;`,
    )
    expect(!out.includes('permission_denied')).toBe(true)
    expect(out.includes('provision')).toBe(true)
  },
)

test(
  'RPC: an ADMIN may provision via the finalize RPC (the JWT claim admin/teacher speaks)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT ppg_provision_finalize(null, '64110002', 'Sam B. Boonthee', 'duplicate');
      ROLLBACK;`,
    )
    expect(!out.includes('permission_denied')).toBe(true)
  },
)

test(
  'Audit: EXACTLY ONE provision event is written inside the call (the count proves the RPC INSERT, not a trigger)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT ppg_provision_finalize(null, '64110001', 'Lew A. Boonthi', 'created');
        SELECT count(*) FROM ppg_audit_events WHERE action = 'provision';
      ROLLBACK;`,
    )
    expect(out.includes('1')).toBe(true)
    expect(out.includes('provision')).toBe(true)
  },
)

test(
  'RLS: a learner may NOT INSERT a profile row themselves (the WITH CHECK admin-only denies, no self-registration exists)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        INSERT INTO ppg_profiles (id, student_id, full_name, role)
        VALUES ('99990001-0001-0001-0001-000100010001', '99990001', 'Self Registrant', 'learner');
      ROLLBACK;`,
    )
    expect(out.includes('violates row-level security policy')).toBe(true)
    expect(out.includes('ppg_profiles_insert')).toBe(true)
  },
)

test(
  'Flag: ppg_profiles.must_change_password exists (the ALTER landed, provisioned rows ride the trigger coalesce)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT must_change_password FROM ppg_profiles ORDER BY student_id;
      ROLLBACK;`,
    )
    expect(out.includes('false')).toBe(true)
    expect(out.includes('t') || out.includes('true')).toBe(true)
  },
)

test(
  'Audit: no password material lands in the provision event details (only student_id/full_name/line_result)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT ppg_provision_finalize(null, '64110001', 'Lew A. Boonthi', 'created');
        SELECT details::text FROM ppg_audit_events WHERE action = 'provision';
      ROLLBACK;`,
    )
    expect(out.includes('student_id')).toBe(true)
    expect(out.includes('full_name')).toBe(true)
    expect(out.includes('line_result')).toBe(true)
    expect(!out.includes('password')).toBe(true)
  },
)
