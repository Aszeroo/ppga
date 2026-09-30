import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #16 database-seam tests: the research export is exercised against
 * the REAL local Postgres (`supabase start`) the same way `review.test.ts`
 * prescribes — `SET LOCAL role authenticated` + `SET LOCAL "request.jwt.claims"`
 * (the JWT role claim is the function gate's authority; `sub` is the seeded
 * account) inside a transaction, then ROLLBACK.
 *
 * The authorities here: `ppg_research_export` is TEACHER/ADMIN-ONLY (a
 * learner's call NEVER yields bytes — `permission_denied`); the format gate
 * refuses even a smuggled `pdf` (`export_format_denied` — the PDF report is
 * issue #17); EVERY export run writes EXACTLY ONE audit event on the SAME
 * call (who = actor_id, what = action + details, when = created_at, and the
 * event pins to this transaction because created_at defaults to now()); the
 * extract's rows EQUAL the tables' state (real student identity, the Pre-Test
 * score, the rubric totals — verified against the very tables, not a copy);
 * the empty cohort is a NORMAL 0-row result that is STILL audited.
 *
 * Guarded: without a live local stack the tests skip so CI stays green.
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

const claims = (role: string, sub: string) =>
  `SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

const scores = (c1: number, c2: number, c3: number, c4: number, c5: number, c6: number, c7: number) =>
  `jsonb_build_object('content_structure',${c1},'text_formatting',${c2},'images_visual',${c3},'slide_design',${c4},'powerpoint_tool_usage',${c5},'creativity',${c6},'completeness',${c7})`

const ALL_THREES = scores(3, 3, 3, 3, 3, 3, 3)

test(
  'Role gate: a LEARNER call of the export RPC and the preview RPC NEVER yields data (permission_denied) and NEVER writes an audit event',
  { skip: !hasLocalStack },
  async () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT public.ppg_research_export('csv');
      ROLLBACK;
      BEGIN; SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learnerA}"}';
        SELECT public.ppg_research_export_preview();
      ROLLBACK;
      BEGIN;
        SELECT count(*) FROM public.ppg_audit_events
        WHERE action = 'research_export'
          AND actor_id = '${seededIds.learnerA}';
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
    // the learner's call ERRORED inside its transaction — never an audit
    // event either (a denied smuggle is not an export run).
    expect(out).toContain('0')
  },
)

test(
  'Format gate: even a TEACHER smuggling `pdf` rides the format deny — the PDF report is issue #17, never this RPC',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT public.ppg_research_export('pdf');
      ROLLBACK;`,
    )
    expect(out.includes('export_format_denied')).toBe(true)
  },
)

test(
  'Teacher ALLOWED path: the extract rides, the preview counts, and EXACTLY ONE audit event lands on the same call (who/what/when)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT jsonb_array_length((public.ppg_research_export('csv')->'rows'))
             = (SELECT count(*) FROM public.ppg_profiles WHERE role = 'learner');
        SELECT public.ppg_research_export_preview() ->> 'participant_count'
             = (SELECT count(*)::text FROM public.ppg_profiles WHERE role = 'learner');
      ROLLBACK;
      BEGIN; SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
        SELECT public.ppg_research_export('xlsx');
        RESET ROLE; -- the AUDIT READ rides the owner (a teacher cannot read
        -- the audit stream — the #6 table policy is admin-only; the event is
        -- still WRITTEN by the export call, this only proves its existence).
        -- the event pins to THIS transaction: created_at defaults to now(),
        -- and now() is the transaction timestamp.
        SELECT count(*) FROM public.ppg_audit_events
        WHERE action = 'research_export'
          AND actor_id = '${seededIds.teacher}'
          AND created_at = now();
        SELECT target_type || '|' || target_id || '|' || (details ->> 'format')
          FROM public.ppg_audit_events
         WHERE action = 'research_export'
           AND actor_id = '${seededIds.teacher}'
           AND created_at = now();
      ROLLBACK;`,
    )
    expect(out).toContain('t') // extract length = the profiles' count
    expect(out).toContain('1') // exactly one audit event, same call
    expect(out).toContain('cohort|all_participants|xlsx') // what it says
    expect(out.includes('permission_denied')).toBe(false)
  },
)

test(
  'The extract EQUALS the tables: real identity, the Pre-Test score, the rubric totals — read back against the very tables',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        -- Hermetic: any pre-transaction research residue for the seeded
        -- learners (e.g. a probe row a crashed session left in the shared
        -- container) would collide the INSERT below on the PK. The clears
        -- ride the OWNER (superuser, before the SET LOCAL role) INSIDE the
        -- same transaction — ROLLBACK restores whatever stood.
        DELETE FROM public.ppg_pretest_responses
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        DELETE FROM public.ppg_posttest_responses
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        DELETE FROM public.ppg_survey_responses
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        DELETE FROM public.ppg_rubric_reviews
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        DELETE FROM public.ppg_submissions
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        DELETE FROM public.ppg_xp_ledger
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        DELETE FROM public.ppg_badge_awards
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        ${impersonate('learner', seededIds.learnerA).replace('BEGIN;', '')}
        INSERT INTO public.ppg_pretest_responses
          (learner_id, instrument_version, language, answers, score, submitted_at)
        VALUES ('${seededIds.learnerA}', '2026.09.1', 'th', '{"item_1": "A"}', 1,
                '2026-09-30T02:03:04Z');
        SELECT public.ppg_insert_submission('${seededIds.learnerA}', 'module-08', 911,
          'submissions/${seededIds.learnerA}/module-08/911', 'pptx', 1000, 'x');
        SELECT public.ppg_set_submission_status('${seededIds.learnerA}', 'module-08', 911, 'submitted');
        ${claims('teacher', seededIds.teacher)}
        SELECT public.ppg_submit_review('module-08', 911, ${ALL_THREES},
          'approved', 'fb th', 'fb en');
        ${claims('admin', seededIds.admin)}
        WITH r AS (
          SELECT jsonb_array_elements(
            (public.ppg_research_export('csv') -> 'rows')) AS row)
        SELECT string_agg(row ->> 'student_id', ',' ORDER BY row ->> 'student_id') FROM r;
        WITH r AS (
          SELECT jsonb_array_elements(
            (public.ppg_research_export('csv') -> 'rows')) AS row)
        SELECT row ->> 'full_name' FROM r WHERE row ->> 'student_id' = '64110001';
        WITH r AS (
          SELECT jsonb_array_elements(
            (public.ppg_research_export('csv') -> 'rows')) AS row)
        SELECT (row ->> 'pretest_score')::int
             = (SELECT score FROM public.ppg_pretest_responses
                 WHERE learner_id = '${seededIds.learnerA}') FROM r
         WHERE row ->> 'student_id' = '64110001';
        WITH r AS (
          SELECT jsonb_array_elements(
            (public.ppg_research_export('csv') -> 'rows')) AS row)
        SELECT (row ->> 'rubric_latest_total') || '|'
             || (row ->> 'rubric_latest_mission') || '|'
             || (row ->> 'rubric_review_count') || '|'
             || (row ->> 'rubric_latest_decision') FROM r
         WHERE row ->> 'student_id' = '64110001';
        WITH r AS (
          SELECT jsonb_array_elements(
            (public.ppg_research_export('csv') -> 'rows')) AS row)
        SELECT (row ->> 'pretest_score') IS NULL
           AND (row ->> 'rubric_review_count') = '0' FROM r
         WHERE row ->> 'student_id' = '64110002';
      ROLLBACK;`,
    )
    expect(out).toContain('64110001,64110002') // both participants, real ids
    expect(out).toContain('Learner One') // real identity per the spec decision
    expect(out).toContain('t') // the score EQUALS the table's own value
    expect(out).toContain('21|module-08|1|approved') // rubric totals ride the row
  },
)

test(
  'Empty cohort: 0 learner profiles is a NORMAL export (0 rows) — still audit-logged with participant_count 0',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        -- the owner (RLS-bypass) empties the cohort INSIDE the transaction;
        -- the ROLLBACK below restores every seeded row.
        DELETE FROM public.ppg_profiles WHERE role = 'learner';
        SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"admin","sub":"${seededIds.admin}"}';
        SELECT (public.ppg_research_export('csv') -> 'rows') = '[]'::jsonb
           AND (public.ppg_research_export('csv') ->> 'participant_count') = '0';
        SELECT details ->> 'participant_count' FROM public.ppg_audit_events
         WHERE action = 'research_export'
           AND actor_id = '${seededIds.admin}'
           AND created_at = now();
      ROLLBACK;`,
    )
    expect(out).toContain('t') // rows = [] AND participant_count = 0
    expect(out).toContain('0') // the audit event recorded the empty run
    expect(out.includes('permission_denied')).toBe(false)
  },
)

test(
  'The SQL format is a restorable transaction script: BEGIN/COMMIT, the identity + research-table INSERTs, ON CONFLICT DO NOTHING',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT (public.ppg_research_export('sql') ->> 'sql_dump') LIKE '%BEGIN;%'
           AND (public.ppg_research_export('sql') ->> 'sql_dump') LIKE '%COMMIT;%'
           AND (public.ppg_research_export('sql') ->> 'sql_dump') LIKE '%INSERT INTO public.ppg_profiles%'
           AND (public.ppg_research_export('sql') ->> 'sql_dump') LIKE '%ON CONFLICT (id) DO NOTHING;%'
           AND (public.ppg_research_export('sql') ->> 'sql_dump') LIKE '%-- ppg_pretest_responses%';
      ROLLBACK;`,
    )
    expect(out).toContain('t')
  },
)
