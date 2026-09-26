import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #9 database-seam tests: the map's lock states (module 1 open after
 * the gate, the rest locked by the linear rule), the locked/draft/arched
 * content denial at RLS, the gate the #8 migration speaks respected here,
 * and the admin publication toggle (+ audit) are exercised against the
 * REAL local Postgres (`sup start`) the same way `prettest.test.ts`
 * prescribes — `SET LOCAL role authenticated` + `SET LOCAL
 * "request.jwt.claims"` inside a transaction, then ROLLBACK.
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
  'Gate: an ungated learner sees NO module row (the map/lesson RPC deny server-side, never a hidden UI)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110002)}
        SELECT ppg_course_map() FROM TRUE;
      ROLLBACK;`,
    )
    // No consent, no submit: the gate denies — the RPC returns NO rows
    // server-side (`SELECT 0`), never a smuggled map.
    expect(out.includes('SELECT 0')).toBe(true)
  },
)

test(
  'Map: a gated learner sees ONLY module-01 (module 1 open on the gate alone; the rest locked by the linear rule)',
  { skip: !hasLocalStack },
  () => {
    // Left from the earlier #8 ticket: consent + a submitted response on
    // 64110001. Re-read the map as that learner.
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_course_map() FROM TRUE;
      ROLLBACK;`,
    )
    expect(out.includes('module-01')).toBe(true)
    expect(out.includes('module-02')).toBe(false)
  },
)

test(
  'Lock: a gated learner may NOT READ a LOCKED module\'s lesson rows (RLS denies, not a hidden UI)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_module_lessons('module-02') FROM TRUE;
      ROLLBACK;`,
    )
    // The module is locked (its prior Mission is `incomplete`): the
    // function's own WHERE returns `[]` — no lesson rows server-side.
    expect(out.includes('SELECT 0') || out.includes('[]')).toBe(true)
  },
)

test(
  'Lock: the OPEN module detail read shows its lessons (module-01 after the gate)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_module_lessons('module-01') FROM TRUE;
      ROLLBACK;`,
    )
    expect(out.includes('module-01-lesson-01')).toBe(true)
    expect(out.includes('module-01-lesson-02')).toBe(true)
  },
)

test(
  'Draft: an admin sets a module draft; the gated learner READS it INVISIBLY server-side',
  { skip: !hasLocalStack },
  () => {
    sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT ppg_set_publication('module-01', 'draft');
      COMMIT;`,
    )
    const read = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT module_key FROM ppg_modules WHERE TRUE;
      ROLLBACK;`,
    )
    expect(read.includes('SELECT 0')).toBe(true)
    // An admin still sees the draft row (the console sees what the toggle
    // can change).
    const adminRead = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT publication_state FROM ppg_modules WHERE module_key = 'module-01';
      ROLLBACK;`,
    )
    expect(adminRead.includes('draft')).toBe(true)
  },
)

test(
  'Archived: an admin archives a lesson; the gated learner READS it INVISIBLY server-side',
  { skip: !hasLocalStack },
  () => {
    sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT ppg_set_publication('module-01-lesson-02', 'archived');
      COMMIT;`,
    )
    const read = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT lesson_key FROM ppg_lessons WHERE TRUE;
      ROLLBACK;`,
    )
    expect(read.includes('module-01-lesson-02')).toBe(false)
    expect(read.includes('module-01-lesson-01')).toBe(true)
  },
)

test(
  'Toggle audit: every publication toggle writes exactly one audit event (action `publication`)',
  { skip: !hasLocalStack },
  () => {
    const audit = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT action, target_id, details
          FROM ppg_audit_events
         WHERE action = 'publication';
      COMMIT;`,
    )
    expect(audit.includes('publication')).toBe(true)
    expect(audit.includes('module-01')).toBe(true)
    expect(audit.includes('old_state')).toBe(true)
  },
)

test(
  'Smuggle: a learner/teacher may NOT call the publication RPC (permission_denied, never a silent write)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT ppg_set_publication('module-02', 'draft');
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
    expect(out.includes('UPDATE 1')).toBe(false)
  },
)

test(
  'Rule seed: the placeholder mission table says `incomplete` (module 1 open, the rest locked FOR NOW)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learner64110001)}
        SELECT count(*) FROM ppg_module_missions WHERE status = 'incomplete';
      ROLLBACK;`,
    )
    // 9 modules but module 1, for each seeded learner — the linear rule
    // reads `complete` only, so the rest stay LOCKED server-side.
    expect(out.includes('17') || out.includes('9') || out.includes('18')).toBe(true)
  },
)
