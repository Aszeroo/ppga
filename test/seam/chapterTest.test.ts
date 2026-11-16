import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #74 Chapter pre/post-test database seam: fresh attempt, single pre
 * attempt, post-test retries with the first score preserved as the research
 * measure, the 70% best-score gate, parallel-form coverage, active-course
 * resolution and answer-key non-disclosure — all against the REAL local
 * Postgres.
 *
 * Hermetic: every test opens its own transaction, resets the learner's
 * attempts/unlocks in-tx, impersonates the learner (`SET LOCAL role
 * authenticated` + JWT claims) and ROLLS BACK. The malformed-bank tests
 * deliberately COMMIT so the deferred constraint trigger speaks; the failed
 * COMMIT rolls the transaction back.
 *
 * Guarded: without a live local stack the suite skips (CI stays green).
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
}

const sql = (statement: string) =>
  execSync(`docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`, {
    input: statement,
    encoding: 'utf8',
  })

const asRole = (role: string, sub: string) =>
  `SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

// The #8 gate open inside the caller's transaction: consent + a submitted
// Pre-Test response. The learner's Chapter attempts/unlocks reset in-tx.
const gateOpen = (learnerId: string) => `
  DELETE FROM ppg_chapter_test_attempts WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_chapter_unlocks WHERE learner_id = '${learnerId}';
  DELETE FROM ppg_pretest_responses WHERE learner_id = '${learnerId}';
  UPDATE ppg_profiles SET consent = true, prettest_unlocked_override = false
   WHERE id = '${learnerId}';
  INSERT INTO ppg_pretest_responses
    (learner_id, instrument_version, language, answers, submitted_at)
  VALUES ('${learnerId}', '2026.09.1', 'th', '{"item_1":"A"}'::jsonb, now());`

const answers = (letters: string[]) =>
  JSON.stringify(Object.fromEntries(letters.map((letter, index) => [String(index + 1), letter])))

// The seeded Chapter 1 keys (the pilot banks' correct options).
const PRE_PASS = answers(['c', 'b', 'a', 'c', 'b', 'a', 'c', 'b', 'a', 'b'])
const POST_PASS = answers(['b', 'c', 'a', 'b', 'c', 'a', 'c', 'b', 'b', 'c'])
const POST_SEVEN = answers(['b', 'c', 'a', 'b', 'c', 'a', 'c', 'a', 'a', 'a'])
const POST_SIX = answers(['b', 'c', 'a', 'b', 'c', 'a', 'b', 'a', 'a', 'a'])
const POST_ZERO = answers(['a', 'a', 'b', 'a', 'a', 'b', 'a', 'a', 'a', 'a'])

test(
  'Key non-disclosure: the state RPC returns prompts + options only, and a client SELECT on the bank returns no rows',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT 'state='||ppg_chapter_test_state('chapter-01')::text;
        SELECT 'rows='||count(*) FROM ppg_chapter_test_questions;
      ROLLBACK;`,
    )
    // The state carries both banks but never the answer-key column/field.
    expect(out.includes('"chapter_key": "chapter-01"')).toBe(true)
    expect(out.includes('"questions"')).toBe(true)
    expect(out.includes('"is_correct"')).toBe(false)
    expect(out.includes('"answer_key"')).toBe(false)
    // No RLS select policy on the bank: the client reads zero rows.
    expect(out.includes('rows=0')).toBe(true)
  },
)

test(
  'Fresh pre attempt: server-side score, one attempt only, no unlock (the pre-test is diagnostic)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT 'pre='||ppg_chapter_test_submit('chapter-01','pre','th','${PRE_PASS}'::jsonb)::text;
        SELECT 'attempts='||count(*) FROM ppg_chapter_test_attempts
         WHERE learner_id = auth.uid() AND chapter_key = 'chapter-01' AND phase = 'pre';
        SELECT 'unlock='||count(*) FROM ppg_chapter_unlocks WHERE learner_id = auth.uid();
        SELECT 'second='||ppg_chapter_test_submit('chapter-01','pre','th','${PRE_PASS}'::jsonb)::text;
      ROLLBACK;`,
    )
    expect(out.includes('"attempt_seq": 1')).toBe(true)
    expect(out.includes('"score": 10')).toBe(true)
    expect(out.includes('"feedback"')).toBe(true)
    expect(out.includes('attempts=1')).toBe(true)
    // a passing pre-test never unlocks the next chapter
    expect(out.includes('unlock=0')).toBe(true)
    // the second pre-test is rejected by the RPC (and the partial index)
    expect(out.includes('pre_already_submitted')).toBe(true)
  },
)

test(
  'Post retries: the first score stays the research measure, the best score gates, attempts append',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT 'fail='||ppg_chapter_test_submit('chapter-01','post','th','${POST_ZERO}'::jsonb)::text;
        SELECT 'pass='||ppg_chapter_test_submit('chapter-01','post','th','${POST_PASS}'::jsonb)::text;
        SELECT 'retry='||ppg_chapter_test_submit('chapter-01','post','th','${POST_ZERO}'::jsonb)::text;
        SELECT 'attempts='||count(*) FROM ppg_chapter_test_attempts
         WHERE learner_id = auth.uid() AND chapter_key = 'chapter-01' AND phase = 'post';
        SELECT 'first='||score FROM ppg_chapter_test_attempts
         WHERE learner_id = auth.uid() AND chapter_key = 'chapter-01' AND phase = 'post'
         ORDER BY attempt_seq ASC LIMIT 1;
        SELECT 'best='||max(score) FROM ppg_chapter_test_attempts
         WHERE learner_id = auth.uid() AND chapter_key = 'chapter-01' AND phase = 'post';
        SELECT 'unlocks='||count(*) FROM ppg_chapter_unlocks
         WHERE learner_id = auth.uid() AND chapter_key = 'chapter-02';
      ROLLBACK;`,
    )
    const fail = out.slice(out.indexOf('fail='), out.indexOf('pass='))
    const pass = out.slice(out.indexOf('pass='), out.indexOf('retry='))
    const retry = out.slice(out.indexOf('retry='), out.indexOf('attempts='))
    // first attempt: 1/10, below the gate, no unlock yet
    expect(fail.includes('"score": 0')).toBe(true)
    expect(fail.includes('"passed": false')).toBe(true)
    expect(fail.includes('"next_unlocked": false')).toBe(true)
    // second attempt: 10/10, passes; first_score is the earlier 0
    expect(pass.includes('"score": 10')).toBe(true)
    expect(pass.includes('"first_score": 0')).toBe(true)
    expect(pass.includes('"best_score": 10')).toBe(true)
    expect(pass.includes('"attempt_seq": 2')).toBe(true)
    expect(pass.includes('"passed": true')).toBe(true)
    expect(pass.includes('"next_unlocked": true')).toBe(true)
    // third attempt: low score again; the BEST still gates, the unlock stays
    expect(retry.includes('"best_score": 10')).toBe(true)
    expect(retry.includes('"passed": true')).toBe(true)
    expect(out.includes('attempts=3')).toBe(true)
    expect(out.includes('first=0')).toBe(true)
    expect(out.includes('best=10')).toBe(true)
    expect(out.includes('unlocks=1')).toBe(true)
  },
)

test(
  'Threshold: exactly 70% (7/10) unlocks chapter-02',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110001)}
        ${asRole('learner', seededIds.learner64110001)}
        SELECT 'seven='||ppg_chapter_test_submit('chapter-01','post','th','${POST_SEVEN}'::jsonb)::text;
        SELECT 'unlocks='||count(*) FROM ppg_chapter_unlocks
         WHERE learner_id = auth.uid() AND chapter_key = 'chapter-02';
      ROLLBACK;`,
    )
    expect(out.includes('"score": 7')).toBe(true)
    expect(out.includes('"passed": true')).toBe(true)
    expect(out.includes('unlocks=1')).toBe(true)
  },
)

test(
  'Threshold: 6/10 (below 70%) does NOT unlock chapter-02',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner64110002)}
        ${asRole('learner', seededIds.learner64110002)}
        SELECT 'six='||ppg_chapter_test_submit('chapter-01','post','th','${POST_SIX}'::jsonb)::text;
        SELECT 'unlocks='||count(*) FROM ppg_chapter_unlocks
         WHERE learner_id = auth.uid() AND chapter_key = 'chapter-02';
      ROLLBACK;`,
    )
    expect(out.includes('"score": 6')).toBe(true)
    expect(out.includes('"passed": false')).toBe(true)
    expect(out.includes('unlocks=0')).toBe(true)
  },
)

test(
  'Parallel forms: 10 pre + 10 post items, exactly 3 options and one key each, same objective coverage',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      SELECT 'pre_items='||count(DISTINCT order_index) FROM ppg_chapter_test_questions
       WHERE chapter_key = 'chapter-01' AND phase = 'pre';
      SELECT 'post_items='||count(DISTINCT order_index) FROM ppg_chapter_test_questions
       WHERE chapter_key = 'chapter-01' AND phase = 'post';
      SELECT 'bad_items='||count(*) FROM (
        SELECT phase, form, order_index
          FROM ppg_chapter_test_questions
         WHERE chapter_key = 'chapter-01'
         GROUP BY phase, form, order_index
        HAVING count(*) <> 3 OR count(*) FILTER (WHERE is_correct) <> 1
      ) x;
      SELECT 'unpaired_objectives='||count(*) FROM (
        SELECT objective_key
          FROM ppg_chapter_test_questions
         WHERE chapter_key = 'chapter-01'
         GROUP BY objective_key
        HAVING count(DISTINCT phase) <> 2
      ) y;
      SELECT 'pre_objectives='||count(DISTINCT objective_key) FROM ppg_chapter_test_questions
       WHERE chapter_key = 'chapter-01' AND phase = 'pre';
      SELECT 'post_objectives='||count(DISTINCT objective_key) FROM ppg_chapter_test_questions
       WHERE chapter_key = 'chapter-01' AND phase = 'post';
    `)
    expect(out.includes('pre_items=10')).toBe(true)
    expect(out.includes('post_items=10')).toBe(true)
    expect(out.includes('bad_items=0')).toBe(true)
    expect(out.includes('unpaired_objectives=0')).toBe(true)
    expect(out.includes('pre_objectives=10')).toBe(true)
    expect(out.includes('post_objectives=10')).toBe(true)
  },
)

test(
  'Bank guard: a missing answer key is rejected at COMMIT (malformed_bank)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      BEGIN;
      UPDATE ppg_chapter_test_questions SET is_correct = false
       WHERE chapter_key = 'chapter-01' AND phase = 'pre' AND form = 'a' AND order_index = 1;
      COMMIT;`)
    expect(out.includes('malformed_bank')).toBe(true)
  },
)

test(
  'Bank guard: a duplicate option key is rejected by the primary key',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      BEGIN;
      INSERT INTO ppg_chapter_test_questions
        (chapter_key, phase, form, order_index, objective_key, option_key,
         prompt_th, prompt_en, option_th, option_en, is_correct)
      VALUES
        ('chapter-01', 'pre', 'a', 1, 'purpose', 'a',
         'x', 'x', 'x', 'x', false);
      COMMIT;`)
    expect(out.toLowerCase().includes('duplicate key')).toBe(true)
  },
)

test(
  'Bank guard: an odd option count is rejected at COMMIT (malformed_bank)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      BEGIN;
      DELETE FROM ppg_chapter_test_questions
       WHERE chapter_key = 'chapter-01' AND phase = 'pre' AND form = 'a'
         AND order_index = 1 AND option_key = 'c';
      COMMIT;`)
    expect(out.includes('malformed_bank')).toBe(true)
  },
)

test(
  'Active course: the legacy modules are archived and the learner map resolves only chapter-01',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      SELECT 'legacy_active='||count(*) FROM ppg_modules m
        JOIN ppg_courses c ON c.course_key = m.course_key
       WHERE c.course_key = 'powerpoint-creation' AND m.publication_state <> 'archived';
      SELECT 'active_course='||count(*) FROM ppg_courses
       WHERE course_key = 'presentation-program' AND is_active;
      SELECT 'chapter='||count(*) FROM ppg_modules
       WHERE module_key = 'chapter-01' AND course_key = 'presentation-program'
         AND publication_state = 'published';`)
    expect(out.includes('legacy_active=0')).toBe(true)
    expect(out.includes('active_course=1')).toBe(true)
    expect(out.includes('chapter=1')).toBe(true)
  },
)
