import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #9 database-seam tests: the map's lock states (module 1 open after
 * the gate, the rest locked by the linear rule), the locked/draft/arched
 * content denial at RLS, the gate the #8 migration speaks respected here,
 * and the admin publication toggle (+ audit) are exercised against the
 * REAL local Postgres (`supabase start`) the same way `prettest.test.ts`
 * prescribes — `SET LOCAL role authenticated` + `SET LOCAL
 * "request.jwt.claims"` inside a transaction, then ROLLBACK.
 *
 * EVERY test is hermetic: the gate state (consent + a submitted response)
 * and the publication resets ride INSIDE the test's own transaction as the
 * owner (RLS-bypass) and ROLL BACK — no COMMIT, no cross-file order
 * dependence, no residue in the shared container. The map/lesson RPCs
 * return one JSONB value, so the asserts read the real jsonb shapes (`[]`
 * for the locked detail, `"lock_state": "locked"` on the map), never a
 * command status (`-tA` never prints one).
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

// the gate CLOSED inside the caller's open transaction (the seeded baseline).
const gateClosed = (learnerId: string) => `
  DELETE FROM ppg_pretest_responses WHERE learner_id = '${learnerId}';
  UPDATE ppg_profiles SET consent = false, prettest_unlocked_override = false
   WHERE id = '${learnerId}';`

// the publication baseline (all published, no publication audit rows) rides
// the SAME transaction — whatever the container holds, the tx starts clean.
const publicationReset = `
  UPDATE ppg_modules SET publication_state = 'published';
  UPDATE ppg_lessons SET publication_state = 'published';
  DELETE FROM ppg_audit_events WHERE action = 'publication';`

test(
  'Gate: an ungated learner sees NO module row (the map/lesson RPC deny server-side, never a hidden UI)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateClosed(seededIds.learner64110002)}
        ${asRole('learner', seededIds.learner64110002)}
        SELECT ppg_course_map();
        SELECT ppg_module_lessons('module-01');
      ROLLBACK;`,
    )
    // The map's WHERE drops the ungated learner's rows — jsonb_agg over no
    // rows is NULL (printed as an empty line), NEVER a smuggled map; the
    // lesson detail answers `[]`.
    expect(out.includes('module_key')).toBe(false)
    expect(out.includes('[]')).toBe(true)
  },
)

test(
  'Map: a gated learner sees ONLY module-01 OPEN (module 1 opens on the gate alone; the rest stay locked)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_course_map();
      ROLLBACK;`,
    )
    // every SEE-ABLE module rides the map (locked ones as locked — never
    // invisible): module-01 OPEN on the gate alone, module-02 LOCKED (the
    // linear rule reads the mission `complete` rows — none exist). The
    // jsonb prints insertion-ordered keys (`"lock_state": .., "module_key": ..`).
    expect(out.includes('"lock_state": "open", "module_key": "module-01"')).toBe(true)
    expect(out.includes('"lock_state": "locked", "module_key": "module-02"')).toBe(true)
    expect(out.includes('"lock_state": "open", "module_key": "module-02"')).toBe(false)
  },
)

test(
  "Lock: a gated learner may NOT READ a LOCKED module's lesson rows (RLS denies, not a hidden UI)",
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_module_lessons('module-02');
      ROLLBACK;`,
    )
    // The module is locked (its prior Mission is `incomplete`): the
    // function's own authority returns `[]` — no lesson rows server-side.
    expect(out.includes('[]')).toBe(true)
    expect(out.includes('lesson_key')).toBe(false)
  },
)

test(
  'Lock: the OPEN module detail read shows its lessons (module-01 after the gate)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_module_lessons('module-01');
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
    const out = sql(
      `BEGIN;
        ${publicationReset}
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('admin', seededIds.admin)}
        SELECT ppg_set_publication('module-01', 'draft');
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_course_map();
        ${asRole('admin', seededIds.admin)}
        SELECT publication_state FROM ppg_modules WHERE module_key = 'module-01';
      ROLLBACK;`,
    )
    // the drafted module is INVISIBLE to the learner's map (no module-01
    // row); the admin still sees the draft (the console sees what the
    // toggle can change).
    expect(out.includes('"module_key": "module-01"')).toBe(false)
    expect(out.includes('draft')).toBe(true)
  },
)

test(
  'Archived: an admin archives a lesson; the gated learner READS it INVISIBLY server-side',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${publicationReset}
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('admin', seededIds.admin)}
        SELECT ppg_set_publication('module-01-lesson-02', 'archived');
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_module_lessons('module-01');
      ROLLBACK;`,
    )
    // the archived lesson never rides the learner's detail; the sibling
    // lesson still does.
    expect(out.includes('module-01-lesson-02')).toBe(false)
    expect(out.includes('module-01-lesson-01')).toBe(true)
  },
)

test(
  'Toggle audit: every publication toggle writes exactly one audit event (action `publication`)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${publicationReset}
        ${asRole('admin', seededIds.admin)}
        SELECT ppg_set_publication('module-01', 'draft');
        SELECT 'publication=' || count(*) FROM ppg_audit_events
         WHERE action = 'publication';
        SELECT 'old_state:' || (details ->> 'old_state') FROM ppg_audit_events
         WHERE action = 'publication';
      ROLLBACK;`,
    )
    // EXACTLY one event per toggle (the in-tx cleanup makes the count
    // exact); the details carry the old/new state (ADR-0003).
    expect(out.includes('publication=1')).toBe(true)
    expect(out.includes('old_state:published')).toBe(true)
  },
)

test(
  'Smuggle: a learner/teacher may NOT call the publication RPC (permission_denied, never a silent write)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${publicationReset}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT ppg_set_publication('module-02', 'draft');
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
    // the raise aborts the tx (nothing can write after it); a fresh owner
    // read pins the state at the seeded `published` — never a silent write.
    const state = sql(
      `SELECT 'state=' || publication_state FROM ppg_modules
        WHERE module_key = 'module-02';`,
    )
    expect(state.includes('state=published')).toBe(true)
  },
)

test(
  'Rule seed: the placeholder mission table says `incomplete` (module 1 open, the rest locked FOR NOW)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        SELECT 'incomplete=' || count(*) FROM ppg_module_missions
         WHERE status = 'incomplete';
      ROLLBACK;`,
    )
    // 9 modules × the 2 seeded learners, ALL `incomplete` — the linear rule
    // reads `complete` only, so modules 2..10 stay LOCKED server-side.
    expect(out.includes('incomplete=18')).toBe(true)
  },
)
