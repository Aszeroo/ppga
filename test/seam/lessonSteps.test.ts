import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #75 CAI lesson-step database seam: the seeded Chapter 1 lessons and
 * their steps, the answer-key non-disclosure on both the read and grade
 * paths, the formative grade's zero writes (no XP, no Self-Check event, no
 * unlock), the legacy lesson's empty step read, and the deferred
 * malformed-step guard.
 *
 * Hermetic: every test opens its own transaction, opens the #8 gate in-tx,
 * impersonates the learner and ROLLS BACK. The malformed-step test COMMITs so
 * the deferred constraint trigger speaks; the failed COMMIT rolls back.
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

const learner = '64110001-0001-0001-0001-000100010001'

const sql = (statement: string) =>
  execSync(`docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`, {
    input: statement,
    encoding: 'utf8',
  })

const asRole = (role: string, sub: string) =>
  `SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

// The #8 gate opened inside the caller's transaction (consent + a submitted
// pre-test response), then rolled back with the tx.
const gateOpen = (learnerId: string) => `
  DELETE FROM ppg_pretest_responses WHERE learner_id = '${learnerId}';
  UPDATE ppg_profiles SET consent = true, prettest_unlocked_override = false
   WHERE id = '${learnerId}';
  INSERT INTO ppg_pretest_responses
    (learner_id, instrument_version, language, answers, submitted_at)
  VALUES ('${learnerId}', '2026.09.1', 'th', '{"item_1":"A"}'::jsonb, now());`

test(
  'Key non-disclosure: the read RPC returns steps + options only; a client SELECT on either table returns no rows',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(learner)}
        ${asRole('learner', learner)}
        SELECT 'len='||jsonb_array_length(ppg_lesson_steps('chapter-01-lesson-01'));
        SELECT 'has_key='||(ppg_lesson_steps('chapter-01-lesson-01')::text LIKE '%check_answer_key%');
        SELECT 'has_explanation='||(ppg_lesson_steps('chapter-01-lesson-01')::text LIKE '%check_explanation%');
        SELECT 'direct_steps='||count(*) FROM ppg_lesson_steps;
        SELECT 'direct_options='||count(*) FROM ppg_lesson_step_options;
      ROLLBACK;`,
    )
    expect(out.includes('len=5')).toBe(true)
    expect(out.includes('has_key=false')).toBe(true)
    expect(out.includes('has_explanation=false')).toBe(true)
    expect(out.includes('direct_steps=0')).toBe(true)
    expect(out.includes('direct_options=0')).toBe(true)
  },
)

test(
  'Grade: correct/incorrect is decided server-side, the explanation returns, and the key never does',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(learner)}
        ${asRole('learner', learner)}
        SELECT 'right='||ppg_grade_mini_check('chapter-01-lesson-01', 4, 'c')::text;
        SELECT 'wrong='||ppg_grade_mini_check('chapter-01-lesson-01', 4, 'a')::text;
        SELECT 'has_key='||(ppg_grade_mini_check('chapter-01-lesson-01', 4, 'c')::text LIKE '%check_answer_key%');
      ROLLBACK;`,
    )
    expect(out.includes('"correct": true')).toBe(true)
    expect(out.includes('"correct": false')).toBe(true)
    expect(out.includes('"explanation_th"')).toBe(true)
    expect(out.includes('has_key=false')).toBe(true)
  },
)

test(
  'Formative only: a mini-check writes no XP ledger row, no Self-Check event, and no chapter unlock',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(learner)}
        ${asRole('learner', learner)}
        SELECT ppg_grade_mini_check('chapter-01-lesson-01', 4, 'c');
        SELECT ppg_grade_mini_check('chapter-01-lesson-01', 4, 'a');
        SELECT 'xp='||count(*) FROM ppg_xp_ledger WHERE learner_id = auth.uid();
        SELECT 'events='||count(*) FROM ppg_self_check_events WHERE learner_id = auth.uid();
        SELECT 'unlocks='||count(*) FROM ppg_chapter_unlocks WHERE learner_id = auth.uid();
      ROLLBACK;`,
    )
    expect(out.includes('xp=0')).toBe(true)
    expect(out.includes('events=0')).toBe(true)
    expect(out.includes('unlocks=0')).toBe(true)
  },
)

test(
  'Seeded pilot: three published Chapter 1 lessons, five steps each, one 3-option check per lesson, bilingual copy',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      SELECT 'lessons='||count(*) FROM ppg_lessons
       WHERE module_key = 'chapter-01' AND publication_state = 'published';
      SELECT 'steps='||count(*) FROM ppg_lesson_steps s
        JOIN ppg_lessons l ON l.lesson_key = s.lesson_key
       WHERE l.module_key = 'chapter-01';
      SELECT 'checks='||count(*) FROM ppg_lesson_steps s
        JOIN ppg_lessons l ON l.lesson_key = s.lesson_key
       WHERE l.module_key = 'chapter-01' AND s.kind = 'check';
      SELECT 'bad_options='||count(*) FROM (
        SELECT s.lesson_key, s.order_index
          FROM ppg_lesson_steps s
          JOIN ppg_lessons l ON l.lesson_key = s.lesson_key
         WHERE l.module_key = 'chapter-01' AND s.kind = 'check'
           AND (SELECT count(*) FROM ppg_lesson_step_options o
                 WHERE o.lesson_key = s.lesson_key
                   AND o.step_order_index = s.order_index) <> 3
      ) x;
      SELECT 'bad_key='||count(*) FROM (
        SELECT s.lesson_key, s.order_index
          FROM ppg_lesson_steps s
          JOIN ppg_lessons l ON l.lesson_key = s.lesson_key
         WHERE l.module_key = 'chapter-01' AND s.kind = 'check'
           AND (SELECT count(*) FROM ppg_lesson_step_options o
                 WHERE o.lesson_key = s.lesson_key
                   AND o.step_order_index = s.order_index
                   AND o.option_key = s.check_answer_key) <> 1
      ) y;
      SELECT 'blank='||count(*) FROM ppg_lessons
       WHERE module_key = 'chapter-01'
         AND (btrim(title_th) = '' OR btrim(title_en) = ''
           OR btrim(what_learn_th) = '' OR btrim(what_learn_en) = ''
           OR btrim(body_th) = '' OR btrim(body_en) = '');
      SELECT 'legacy='||ppg_lesson_steps('module-01-lesson-01')::text;`)
    expect(out.includes('lessons=3')).toBe(true)
    expect(out.includes('steps=15')).toBe(true)
    expect(out.includes('checks=3')).toBe(true)
    expect(out.includes('bad_options=0')).toBe(true)
    expect(out.includes('bad_key=0')).toBe(true)
    expect(out.includes('blank=0')).toBe(true)
    expect(out.includes('legacy=[]')).toBe(true)
  },
)

test(
  'Visibility: an ungated learner reads no steps and cannot grade a mini-check',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        DELETE FROM ppg_pretest_responses WHERE learner_id = '${learner}';
        UPDATE ppg_profiles SET consent = false, prettest_unlocked_override = false
         WHERE id = '${learner}';
        ${asRole('learner', learner)}
        SELECT 'ungated='||ppg_lesson_steps('chapter-01-lesson-01')::text;
        SELECT ppg_grade_mini_check('chapter-01-lesson-01', 4, 'c');
      ROLLBACK;`,
    )
    expect(out.includes('ungated=[]')).toBe(true)
    expect(out.includes('check_not_found')).toBe(true)
  },
)

test(
  'Step guard: deleting a check option is rejected at COMMIT (malformed_step)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      BEGIN;
      DELETE FROM ppg_lesson_step_options
       WHERE lesson_key = 'chapter-01-lesson-01' AND step_order_index = 4 AND option_key = 'c';
      COMMIT;`)
    expect(out.includes('malformed_step')).toBe(true)
  },
)
