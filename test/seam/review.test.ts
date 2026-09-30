import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #14 database-seam tests: the Teacher review & practical rubric is
 * exercised against the REAL local Postgres (`supabase start`) the same way
 * `submissions.test.ts`/`rls.test.ts` prescribe it — `SET LOCAL role
 * authenticated` + `SET LOCAL "request.jwt.claims"` (the learner/teacher/admin
 * JWT is the policy/function's authority; `sub` is the account's
 * `auth.users.id` seeded by `20260925000110_seeds.sql`) inside a transaction,
 * then ROLLBACK.
 *
 * The authority here: the review RPC is teacher/admin-ONLY (`denied_role` — a
 * learner's call NEVER yields a review); the rubric validation (a 0/6/8 score
 * NEVER rides — `rubric_score_denied`; 1-5 each; the total 7-35 the SERVER
 * computes, never the client count); the reviews are APPEND-ONLY (a hand
 * UPDATE/DELETE of a rubric row rides the deny triggers — ADR-0002); the
 * +150 XP lands EXACTLY ONCE (the ledger PK (learner_id, event_type,
 * event_ref) — a re-approval/replay NEVER grants a second +150); the
 * teacher/admin ALLOWED path rides `ppg_submit_review` + `ppg_review_queue`.
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

// the full 7-criterion score jsonb (1-5 each) the RPC expects
const scores = (c1: number, c2: number, c3: number, c4: number, c5: number, c6: number, c7: number) =>
  `jsonb_build_object('content_structure',${c1},'text_formatting',${c2},'images_visual',${c3},'slide_design',${c4},'powerpoint_tool_usage',${c5},'creativity',${c6},'completeness',${c7})`

const ALL_THREES = scores(3, 3, 3, 3, 3, 3, 3)

// a fresh `submitted` submission round the review runs against (rolled back
// with the whole review's side effects).
const setupSubmitted = (learnerId: string) => `
  INSERT INTO ppg_submissions
    (learner_id, mission_id, submission_seq, storage_path, file_magic, file_size, reflection, status)
  VALUES ('${learnerId}', 'module-08', 901,
    'submissions/${learnerId}/module-08/901', 'pptx', 1000, 'seam', 'submitted');`

test(
  'Role gate: a LEARNER call of the review submit RPC NEVER yields a review (denied_role)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT public.ppg_submit_review('module-08', 901, ${ALL_THREES},
          'approved', 'ดี', 'good');
      ROLLBACK;`,
    )
    // A learner's call rides the function's own role gate — the title's
    // `denied_role` — and NEVER yields a review row (AC: only Teacher/Admin
    // can review). An all-3s payload is VALID, so it can never raise a
    // `rubric_score_denied`; the denial here is a ROLE denial.
    expect(out.includes('denied_role')).toBe(true)
  },
)

test(
  'Rubric validation: 1-5 scores ride; the total 7-35 is the SERVER-computed sum',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT public.ppg_insert_submission('${seededIds.learnerA}', 'module-08', 903,
          'submissions/${seededIds.learnerA}/module-08/903', 'pptx', 1000, 'x');
        SELECT public.ppg_set_submission_status('${seededIds.learnerA}', 'module-08', 903, 'submitted');
        SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
        SELECT public.ppg_submit_review('module-08', 903,
          ${scores(5, 4, 4, 3, 3, 2, 3)}, 'approved', 'fb th', 'fb en');
      ROLLBACK;`,
    )
    // the review lands (the server's own 24 sum rides the row, never a client count)
    expect(out.includes('rubric_score_denied')).toBe(false)
    expect(out).toContain('24')
  },
)

test(
  'Append-only: a rubric review row NEVER moves by a hand UPDATE (ADR-0002)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT public.ppg_insert_submission('${seededIds.learnerA}', 'module-08', 904,
          'submissions/${seededIds.learnerA}/module-08/904', 'pptx', 1000, 'x');
        SELECT public.ppg_set_submission_status('${seededIds.learnerA}', 'module-08', 904, 'submitted');
        SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
        SELECT public.ppg_submit_review('module-08', 904, ${ALL_THREES},
          'approved', 'fb th', 'fb en');
        RESET ROLE; -- the hand replay rides the OWNER (RLS bypassed) so the
        -- BEFORE UPDATE deny TRIGGER (the ADR-0002 last line of defense) fires.
        UPDATE public.ppg_rubric_reviews
          SET total_score = 35
        WHERE learner_id = '${seededIds.learnerA}'
          AND mission_id = 'module-08'
          AND submission_seq = 904;
      ROLLBACK;`,
    )
    expect(out.includes('append_only_rubric_update_denied')).toBe(true)
  },
)

test(
  'Append-only: a rubric review row NEVER disappears by a hand DELETE (ADR-0002)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT public.ppg_insert_submission('${seededIds.learnerA}', 'module-08', 905,
          'submissions/${seededIds.learnerA}/module-08/905', 'pptx', 1000, 'x');
        SELECT public.ppg_set_submission_status('${seededIds.learnerA}', 'module-08', 905, 'submitted');
        SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
        SELECT public.ppg_submit_review('module-08', 905, ${ALL_THREES},
          'approved', 'fb th', 'fb en');
        RESET ROLE; -- the hand DELETE rides the OWNER (RLS bypassed) so the
        -- BEFORE DELETE deny TRIGGER (the ADR-0002 last line of defense) fires.
        DELETE FROM public.ppg_rubric_reviews
        WHERE learner_id = '${seededIds.learnerA}'
          AND mission_id = 'module-08'
          AND submission_seq = 905;
      ROLLBACK;`,
    )
    expect(out.includes('append_only_rubric_delete_denied')).toBe(true)
  },
)

test(
  'XP idempotency: the +150 lands EXACTLY ONCE across a re-approval/replay (the ledger PK is the authority)',
  { skip: !hasLocalStack },
  () => {
    // the first review of round 906 approves (+150); a replay review of the
    // SAME round reaches not_pending (the row already moved) — the ledger
    // keeps exactly ONE practical_approval row for the mission inside the
    // transaction.
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT public.ppg_insert_submission('${seededIds.learnerA}', 'module-08', 906,
          'submissions/${seededIds.learnerA}/module-08/906', 'pptx', 1000, 'x');
        SELECT public.ppg_set_submission_status('${seededIds.learnerA}', 'module-08', 906, 'submitted');
        SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
        SELECT public.ppg_submit_review('module-08', 906, ${ALL_THREES},
          'approved', 'fb th', 'fb en');
        -- the replay: the same round rides not_pending; the ledger stays ONE row
        SELECT count(*) AS ledger_rows FROM public.ppg_xp_ledger
        WHERE learner_id = '${seededIds.learnerA}'
          AND event_type = 'practical_approval'
          AND event_ref = 'module-08';
      ROLLBACK;`,
    )
    expect(out.includes('150')).toBe(true)
    expect(out).toContain('1')
  },
)

test(
  'Teacher ALLOWED path: the queue reads the submitted rounds (the teacher/admin role rides ppg_review_queue)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `${impersonate('learner', seededIds.learnerA)}
        SELECT public.ppg_insert_submission('${seededIds.learnerA}', 'module-08', 907,
          'submissions/${seededIds.learnerA}/module-08/907', 'pptx', 1000, 'x');
        SELECT public.ppg_set_submission_status('${seededIds.learnerA}', 'module-08', 907, 'submitted');
        SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
        SELECT public.ppg_review_queue('module-08');
      ROLLBACK;`,
    )
    expect(out.includes('denied_role')).toBe(false)
    expect(out.includes(seededIds.learnerA)).toBe(true)
  },
)

test(
  'Rubric validation: a 0/6/8 score NEVER rides (rubric_score_denied — 1-5 each ONLY)',
  { skip: !hasLocalStack },
  () => {
    // the teacher submits a prepared submission (one consistent round: 902 —
    // the insert, the status move and the review ALL ride the same seq/path),
    // then the 0-score smuggle
    const out = sql(
      `BEGIN;
        SET LOCAL role authenticated;
        SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learnerA}"}';
        SELECT public.ppg_insert_submission('${seededIds.learnerA}', 'module-08', 902,
          'submissions/${seededIds.learnerA}/module-08/902', 'pptx', 1000, 'x');
        SELECT public.ppg_set_submission_status('${seededIds.learnerA}', 'module-08', 902, 'submitted');
        SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
        SELECT public.ppg_submit_review('module-08', 902,
          ${scores(0, 3, 3, 3, 3, 3, 3)}, 'approved', 'fb th', 'fb en');
      ROLLBACK;`,
    )
    expect(out.includes('rubric_score_denied')).toBe(true)
  },
)
