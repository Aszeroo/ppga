import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #3 database-seam tests: RLS cross-role denial is exercised against the
 * REAL local Postgres (`supabase start`) the same way Supa's local-testing docs
 * prescribe it — `SET LOCAL role authenticated` + `SET LOCAL "request.jwt.claims"`
 * (the learner/teacher/admin JWT is the policy's authority; `sub` is the
 * account's `auth.users.id` seeded by `20260925000110_seeds.sql`) inside a
 * transaction, then ROLLBACK.
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
  'RLS: a learner may NOT change their own role (escalation denied by CHECK)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        UPDATE ppg_profiles SET role = 'admin' WHERE student_id = '64110001';
      ROLLBACK;`,
    )
    expect(out.includes('violates row-level security policy')).toBe(true)
    expect(out.includes('ppg_profiles_update')).toBe(true)
  },
)

test(
  'RLS: a learner may NOT change another profile (cross-row denied by USING)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        UPDATE ppg_profiles SET full_name = 'stolen' WHERE student_id = '64110002';
      ROLLBACK;`,
    )
    // USING filters rows away; the command tag is `UPDATE 0` — nothing touched.
    expect(out.includes('UPDATE 0')).toBe(true)
  },
)

test(
  'RLS: a teacher may NOT change another profile (own-row only, by USING)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        UPDATE ppg_profiles SET full_name = 'stolen' WHERE student_id = '64110001';
      ROLLBACK;`,
    )
    expect(out.includes('UPDATE 0')).toBe(true)
  },
)

test(
  'RLS: a learner may READ only their own profile (SELECT 1 row, no others)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110002)}
        SELECT student_id FROM ppg_profiles ORDER BY student_id;
      ROLLBACK;`,
    )
    expect(out.includes('64110002')).toBe(true)
    expect(out.includes('64110001')).toBe(false)
    expect(out.includes('admin')).toBe(false)
  },
)

test(
  'RLS: a teacher READS every profile (teacher/admin see all rows)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT student_id FROM ppg_profiles ORDER BY student_id;
      ROLLBACK;`,
    )
    for (const handle of ['admin', 'teacher', '64110001', '64110002', '64110003']) {
      expect(out.includes(handle)).toBe(true)
    }
  },
)
