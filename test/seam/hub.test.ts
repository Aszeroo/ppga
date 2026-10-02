import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #43 (#41 stage 2) database-seam tests: the dashboard hub's READ-ONLY
 * table reads speak the truth the RLS policies decide — a learner's own
 * `complete` Mission rows and OWN submission rounds (status + the Teacher's
 * notes on the round) are visible to NOBODY ELSE (a stranger learner reads 0
 * rows), while the practical-mission catalog is every signed-in role's to
 * read. Exercised against the REAL local Postgres the same way `rls.test.ts`
 * prescribes it — owner-side setup, then `SET LOCAL role authenticated` +
 * `SET LOCAL "request.jwt.claims"` inside a transaction, then ROLLBACK (no
 * residue in the shared container, no cross-file order dependence).
 *
 * Guarded: without a live local stack (`supabase status` reachable) the tests
 * skip so CI (no credentials, no Postgres) stays green.
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
  learnerOne: '64110001-0001-0001-0001-000100010001',
  learnerTwo: '64110002-0002-0002-0002-000200020002',
}

const sql = (statement: string) =>
  execSync(
    `docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`,
    { input: statement, encoding: 'utf8' },
  )

// the claims switch MID-tx (the tx already carries `SET LOCAL role authenticated`
// from the owner-side setup — the leaderboard's pattern).
const asClaims = (role: string, sub: string) =>
  `SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

const impersonate = (role: string, sub: string) =>
  `BEGIN; SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

test(
  'hub reads: the OWN complete Mission rows — a stranger learner reads NONE',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        -- owner-side: ONE real completion for Learner One over a hermetic
        -- baseline (their mission rows), all rolled back below.
        DELETE FROM ppg_module_missions WHERE learner_id = '${seededIds.learnerOne}';
        INSERT INTO ppg_module_missions (module_key, learner_id, status)
        VALUES ('module-01', '${seededIds.learnerOne}', 'complete');
        SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learnerOne}"}';
        SELECT 'own=' || count(*) FROM ppg_module_missions WHERE status = 'complete';
        ${asClaims('learner', seededIds.learnerTwo)}
        SELECT 'other=' || count(*) FROM ppg_module_missions WHERE status = 'complete';
      ROLLBACK;`,
    )
    expect(out.includes('own=1')).toBe(true)
    // the `ppg_module_missions_select` policy filters a learner to own rows —
    // Learner Two reads ZERO of Learner One's completion.
    expect(out.includes('other=0')).toBe(true)
  },
)

test(
  'hub reads: the OWN submission rounds (status + notes) — a stranger reads NONE',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        -- owner-side: one reviewed round owned by Learner One, pinned by a
        -- UNIQUE reflection marker (the append-only deny trigger forbids even
        -- an owner DELETE — the marker keeps the read exact). Rolled back.
        INSERT INTO ppg_submissions
          (learner_id, mission_id, submission_seq, storage_path, file_magic, file_size, reflection, status, review_verdict, review_notes_th, review_notes_en)
        VALUES
          ('${seededIds.learnerOne}', 'module-08',
           (SELECT coalesce(max(submission_seq), 0) + 1 FROM ppg_submissions WHERE learner_id = '${seededIds.learnerOne}' AND mission_id = 'module-08'),
           'seam/probe.pptx', 'pptx', 100, 'seam-hub-probe', 'approved', 'approved', 'โครงสร้างดี', 'good structure');
        SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learnerOne}"}';
        SELECT 'own=' || status || '|' || coalesce(review_verdict,'-') FROM ppg_submissions WHERE reflection = 'seam-hub-probe';
        ${asClaims('learner', seededIds.learnerTwo)}
        SELECT 'other=' || count(*) FROM ppg_submissions WHERE reflection = 'seam-hub-probe';
      ROLLBACK;`,
    )
    expect(out.includes('own=approved|approved')).toBe(true)
    expect(out.includes('other=0')).toBe(true)
  },
)

test(
  'hub reads: the practical-mission catalog is a learner-readable list (4 uploads)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerOne)}
        SELECT 'kind=' || module_key FROM ppg_practical_missions ORDER BY module_key;
      ROLLBACK;`,
    )
    for (const k of ['kind=module-08', 'kind=module-09', 'kind=module-10', 'kind=module-11']) {
      expect(out.includes(k)).toBe(true)
    }
  },
)
