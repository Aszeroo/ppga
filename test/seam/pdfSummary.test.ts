import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #17 database-seam tests: the PDF summary report's data RPC
 * `ppg_pdf_summary()` is exercised against the REAL local Postgres the same
 * transaction+ROLLBACK way `export.test.ts` prescribes (SET LOCAL role
 * authenticated + the JWT claims; ROLLBACK restores everything; self-skip
 * without a live stack).
 *
 * The authorities here: the RPC is TEACHER/ADMIN-ONLY (a learner's call
 * NEVER yields stats — `permission_denied`, never an audit event either);
 * EVERY summary run writes EXACTLY ONE 'pdf_summary' audit event on the SAME
 * call (who/what/when, ADR-0002, #16's vocabulary on the same append-only
 * stream); the statistics EQUAL the database — every mean/distribution/
 * tally the report prints is re-derived BY HAND SQL against the very tables
 * inside the same transaction and compared (the PDF can only ever print
 * what the database computed); and the empty cohort is a NORMAL result
 * (counts 0, means NULL — never a NaN, never a crash), still audit-logged.
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
  execSync(`docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`, {
    input: statement,
    encoding: 'utf8',
  })

const impersonate = (role: string, sub: string) =>
  `BEGIN; SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

const claims = (role: string, sub: string) =>
  `SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

const scores = (c1: number, c2: number, c3: number, c4: number, c5: number, c6: number, c7: number) =>
  `jsonb_build_object('content_structure',${c1},'text_formatting',${c2},'images_visual',${c3},'slide_design',${c4},'powerpoint_tool_usage',${c5},'creativity',${c6},'completeness',${c7})`

const ALL_THREES = scores(3, 3, 3, 3, 3, 3, 3)
const ALL_FOURS = scores(4, 4, 4, 4, 4, 4, 4)

test(
  'Role gate: a LEARNER call of ppg_pdf_summary NEVER yields stats (permission_denied) and NEVER writes an audit event',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT public.ppg_pdf_summary();
      ROLLBACK;
      BEGIN;
        SELECT count(*) FROM public.ppg_audit_events
        WHERE action = 'pdf_summary'
          AND actor_id = '${seededIds.learnerA}';
      ROLLBACK;`,
    )
    expect(out.includes('permission_denied')).toBe(true)
    // the denied smuggle ERRORED inside its transaction — never an audit
    // event either (a denial is not a generation run).
    expect(out).toContain('0')
  },
)

test(
  'Teacher ALLOWED path: the stats ride, and EXACTLY ONE pdf_summary audit event lands on the same call (who/what/when)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('teacher', seededIds.teacher)}
        SELECT 'GATE=' || ((public.ppg_pdf_summary() ->> 'participant_count')
             = (SELECT count(*)::text FROM public.ppg_profiles WHERE role = 'learner'))::text;
        RESET ROLE; -- the AUDIT READ rides the owner (the #6 audit table is
        -- admin-only to staff reads; the event is still WRITTEN by the call).
        SELECT count(*) FROM public.ppg_audit_events
        WHERE action = 'pdf_summary'
          AND actor_id = '${seededIds.teacher}'
          AND created_at = now();
        SELECT target_type || '|' || target_id FROM public.ppg_audit_events
        WHERE action = 'pdf_summary'
          AND actor_id = '${seededIds.teacher}'
          AND created_at = now();
      ROLLBACK;`,
    )
    expect(out).toContain('GATE=t') // participant_count = the learner profiles' count
    expect(out).toContain('1') // EXACTLY one audit event, same call
    expect(out).toContain('cohort|all_participants') // what it says
    expect(out.includes('permission_denied')).toBe(false)
  },
)

test(
  'The statistics EQUAL the database: seeded pre/post scores, rubric reviews and survey answers are re-derived BY HAND SQL and compared — every printed number is the DB number',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        -- Hermetic: the owner (before the SET LOCAL role) clears any research
        -- residue for the seeded learners inside the transaction; ROLLBACK
        -- restores whatever stood.
        DELETE FROM public.ppg_pretest_responses
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        DELETE FROM public.ppg_posttest_responses
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        DELETE FROM public.ppg_survey_responses
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        DELETE FROM public.ppg_submissions
         WHERE learner_id IN ('${seededIds.learnerA}','${seededIds.learnerB}');
        -- Known shape: A = pretest 1 / posttest 10 / survey {item_1:A, item_2:B};
        --               B = pretest 3 / no posttest / survey {item_1:C}.
        INSERT INTO public.ppg_pretest_responses
          (learner_id, instrument_version, language, answers, score, submitted_at)
        VALUES
          ('${seededIds.learnerA}', '2026.09.1', 'th', '{"item_1":"A"}', 1, '2026-09-30T02:00:00Z'),
          ('${seededIds.learnerB}', '2026.09.1', 'th', '{"item_1":"B"}', 3, '2026-09-30T02:00:00Z');
        INSERT INTO public.ppg_posttest_responses
          (learner_id, instrument_version, language, answers, score, submitted_at)
        VALUES
          ('${seededIds.learnerA}', '2026.09.1', 'th', '{"item_1":"A"}', 10, '2026-09-30T03:00:00Z');
        INSERT INTO public.ppg_survey_responses
          (learner_id, instrument_version, language, answers, submitted_at)
        VALUES
          ('${seededIds.learnerA}', '2026.09.1', 'th', '{"item_1":"A","item_2":"B"}', '2026-09-30T04:00:00Z'),
          ('${seededIds.learnerB}', '2026.09.1', 'th', '{"item_1":"C"}', '2026-09-30T04:00:00Z');
        ${impersonate('learner', seededIds.learnerA).replace('BEGIN;', '')}
        SELECT public.ppg_insert_submission('${seededIds.learnerA}', 'module-08', 921,
          'submissions/${seededIds.learnerA}/module-08/921', 'pptx', 1000, 'x');
        SELECT public.ppg_set_submission_status('${seededIds.learnerA}', 'module-08', 921, 'submitted');
        ${claims('learner', seededIds.learnerB)}
        SELECT public.ppg_insert_submission('${seededIds.learnerB}', 'module-08', 922,
          'submissions/${seededIds.learnerB}/module-08/922', 'pptx', 1000, 'x');
        SELECT public.ppg_set_submission_status('${seededIds.learnerB}', 'module-08', 922, 'submitted');
        ${claims('teacher', seededIds.teacher)}
        SELECT public.ppg_submit_review('module-08', 921, ${ALL_THREES}, 'approved', 'fb th', 'fb en');
        SELECT public.ppg_submit_review('module-08', 922, ${ALL_FOURS}, 'approved', 'fb th', 'fb en');
        ${claims('admin', seededIds.admin)}
        -- ONE summary call; every read below rides its jsonb.
        WITH s AS (SELECT public.ppg_pdf_summary() AS v)
        SELECT 'EQ=' || (
          -- the exact DB means, re-derived by hand (round(avg,2) is THE number):
          (v->'pretest'->>'mean')::numeric =
            (SELECT round(avg(score),2) FROM public.ppg_pretest_responses WHERE submitted_at IS NOT NULL)
          AND (v->'posttest'->>'mean')::numeric =
            (SELECT round(avg(score),2) FROM public.ppg_posttest_responses WHERE submitted_at IS NOT NULL)
          -- the hand-computed values too: pretest mean (1+3)/2, posttest 10/1.
          AND (v->'pretest'->>'mean') = '2.00'
          AND (v->'pretest'->>'submitted_count') = '2'
          AND (v->'pretest'->>'min') = '1' AND (v->'pretest'->>'max') = '3'
          AND (v->'posttest'->>'mean') = '10.00'
          AND (v->'posttest'->>'submitted_count') = '1'
          -- rubric: two reviews (21 + 28) → total mean 24.50, band 21-27 ×1, 28-35 ×1.
          AND (v->'rubric'->>'review_count') = '2'
          AND (v->'rubric'->>'total_mean') = '24.50'
          AND (v->'rubric'->'total_distribution'->>'21-27') = '1'
          AND (v->'rubric'->'total_distribution'->>'28-35') = '1'
          AND (v->'rubric'->'total_distribution'->>'7-13') = '0'
          AND (v->'rubric'->'decisions'->>'approved') =
            (SELECT count(*)::text FROM public.ppg_rubric_reviews WHERE decision = 'approved')
          -- a criterion's distribution EQUALS the table (3: the A review, 4: the B review):
          AND (v->'rubric'->'criteria'->0->'counts'->>'3')::int =
            (SELECT count(*) FROM public.ppg_rubric_reviews WHERE score_content_structure = 3)
          AND (v->'rubric'->'criteria'->0->'counts'->>'4')::int =
            (SELECT count(*) FROM public.ppg_rubric_reviews WHERE score_content_structure = 4)
          AND (v->'rubric'->'criteria'->0->>'mean') = '3.50'
          AND (v->'rubric'->'criteria'->0->>'label_th') =
            (SELECT label_th FROM public.ppg_rubric_criteria WHERE criterion_key = 'content_structure')
          -- satisfaction tallies EQUAL the answers table (item_1: A×1 C×1, item_2: B×1):
          AND (v->'satisfaction'->>'submitted_count') =
            (SELECT count(*)::text FROM public.ppg_survey_responses WHERE submitted_at IS NOT NULL)
          AND (v->'satisfaction'->'items'->0->'tallies'->>'A')::int =
            (SELECT count(*) FROM public.ppg_survey_responses
              WHERE submitted_at IS NOT NULL AND answers->>'item_1' = 'A')
          AND (v->'satisfaction'->'items'->0->'tallies'->>'C')::int =
            (SELECT count(*) FROM public.ppg_survey_responses
              WHERE submitted_at IS NOT NULL AND answers->>'item_1' = 'C')
          AND (v->'satisfaction'->'items'->1->'tallies'->>'B')::int =
            (SELECT count(*) FROM public.ppg_survey_responses
              WHERE submitted_at IS NOT NULL AND answers->>'item_2' = 'B')
          ) FROM s;
      ROLLBACK;`,
    )
    expect(out).toContain('EQ=t') // EVERY equality above holds (single AND-chain)
    expect(out.includes('permission_denied')).toBe(false)
    expect(out.includes('ERROR')).toBe(false)
  },
)

test(
  'Empty cohort: 0 learners + 0 responses is a NORMAL report (counts 0, means NULL — never a NaN, never a crash) — still audit-logged',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        -- the owner (RLS-bypass) empties the cohort + every research table
        -- INSIDE the transaction; the ROLLBACK restores every seeded row.
        DELETE FROM public.ppg_pretest_responses;
        DELETE FROM public.ppg_posttest_responses;
        DELETE FROM public.ppg_survey_responses;
        DELETE FROM public.ppg_submissions; -- cascades ppg_rubric_reviews
        DELETE FROM public.ppg_profiles WHERE role = 'learner';
        SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"admin","sub":"${seededIds.admin}"}';
        WITH s AS (SELECT public.ppg_pdf_summary() AS v)
        SELECT 'EMPTY=' || ((v->>'participant_count') = '0'
           AND (v->'pretest'->>'submitted_count') = '0'
           AND (v->'pretest'->>'mean') IS NULL
           AND (v->'posttest'->>'mean') IS NULL
           AND (v->'rubric'->>'total_mean') IS NULL
           AND (v->'rubric'->'total_distribution'->>'21-27') = '0'
           AND jsonb_array_length(v->'rubric'->'criteria') = 7 -- the named rows still print
           AND (v->'satisfaction'->'items') = '[]'::jsonb
          ) FROM s;
        RESET ROLE;
        SELECT details ->> 'participant_count' FROM public.ppg_audit_events
         WHERE action = 'pdf_summary'
           AND actor_id = '${seededIds.admin}'
           AND created_at = now();
      ROLLBACK;`,
    )
    expect(out).toContain('EMPTY=true') // all-zero/NULL shape holds, no crash
    expect(out).toContain('0') // the audit event recorded the empty run
    expect(out.includes('NaN')).toBe(false) // never a NaN anywhere
    expect(out.includes('permission_denied')).toBe(false)
  },
)

test(
  'The audit vocabulary matches #16: one row, action pdf_summary, the report + counts ride the details (append-only stream, ADR-0002)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('admin', seededIds.admin)}
        SELECT public.ppg_pdf_summary();
        RESET ROLE;
        SELECT 'AUD=' || (count(*) = 1
           AND bool_and(action = 'pdf_summary' AND target_type = 'cohort' AND target_id = 'all_participants')
           AND bool_and(details ? 'participant_count' AND details ? 'report'))::text
          FROM public.ppg_audit_events
         WHERE action = 'pdf_summary'
           AND actor_id = '${seededIds.admin}'
           AND created_at = now();
      ROLLBACK;`,
    )
    expect(out).toContain('AUD=true')
  },
)
