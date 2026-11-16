import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * PPGA #88 database-seam tests: the #74 soft archive closed the Course map,
 * but the legacy read paths still authorised on the LESSON's publication
 * state alone. A Learner who typed a direct URL (`/course/module-01`, a
 * legacy lesson, a mission or practical path) could still read archived
 * curriculum. These tests pin the parent-module denial on every learner
 * read/submit path, the teacher/admin exception (history + research export),
 * and the absence of a regression on the active `chapter-NN` spine.
 *
 * Exercised against the REAL local Postgres the same way `curriculum.test.ts`
 * prescribes — owner-side setup, then `SET LOCAL role authenticated` +
 * `SET LOCAL "request.jwt.claims"` inside a transaction, then ROLLBACK (no
 * residue in the shared container). A raised SQL exception aborts the whole
 * transaction, so every denial path gets its own small transaction.
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
  admin: '11111111-1111-1111-1111-111111111111',
  teacher: '22222222-2222-2222-2222-222222222222',
  learner: '64110001-0001-0001-0001-000100010001',
}

const sql = (statement: string) =>
  execSync(
    `docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`,
    { input: statement, encoding: 'utf8' },
  )

const asRole = (role: string, sub: string) =>
  `SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

const asClaims = (role: string, sub: string) =>
  `SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

// The gate OPENED inside the caller's open transaction (owner rights — the
// consent flag + a submitted response; rolled back with the tx). No module is
// re-published: the archive is the subject under test.
const gateOpen = (learnerId: string) => `
  DELETE FROM ppg_pretest_responses WHERE learner_id = '${learnerId}';
  UPDATE ppg_profiles SET consent = true, prettest_unlocked_override = false
   WHERE id = '${learnerId}';
  INSERT INTO ppg_pretest_responses
    (learner_id, instrument_version, language, answers, submitted_at)
  VALUES ('${learnerId}', '2026.09.1', 'th', '{"item_1":"A"}'::jsonb, now());`

const probe = (out: string, label: string) => {
  const start = out.indexOf(`${label}=`)
  if (start === -1) return ''
  const rest = out.slice(start + label.length + 1)
  const next = rest.indexOf('\n')
  return next === -1 ? rest : rest.slice(0, next)
}

test(
  'Direct URL: an archived module/lesson returns the empty state on every learner read',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner)}
        ${asRole('learner', seededIds.learner)}
        SELECT 'lessons='||ppg_module_lessons('module-01')::text;
        SELECT 'steps='||ppg_lesson_steps('module-01-lesson-01')::text;
        SELECT 'selfcheck='||ppg_self_check_questions('module-01-lesson-01')::text;
        SELECT 'mission='||coalesce(ppg_read_mission('module-01')::text, '<null>');
        SELECT 'practical='||coalesce(ppg_read_practical('module-08')::text, '<null>');
        SELECT 'history='||count(*) FROM ppg_submission_history('module-08');
        SELECT 'mission_history='||ppg_mission_history('module-01')::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'lessons')).toBe('[]')
    expect(probe(out, 'steps')).toBe('[]')
    expect(probe(out, 'selfcheck')).toBe('[]')
    expect(probe(out, 'mission')).toBe('<null>')
    expect(probe(out, 'practical')).toBe('<null>')
    expect(probe(out, 'history')).toBe('0')
    expect(probe(out, 'mission_history')).toBe('[]')
    // no archived key may leak through any of those reads
    expect(out.includes('module-01-lesson-01')).toBe(false)
    expect(out.includes('module-08')).toBe(false)
  },
)

test(
  'Teacher/admin: the same archived rows stay readable for history and export',
  { skip: !hasLocalStack },
  () => {
    // one archived-spine row for the teacher/admin history read
    const out = sql(
      `BEGIN;
        DELETE FROM ppg_submissions
         WHERE learner_id = '${seededIds.learner}' AND mission_id = 'module-08' AND submission_seq = 991;
        INSERT INTO ppg_submissions
          (learner_id, mission_id, submission_seq, storage_path, file_magic, file_size, reflection, status)
        VALUES ('${seededIds.learner}', 'module-08', 991,
          'submissions/${seededIds.learner}/module-08/991', 'pptx', 1000, 'archived probe', 'approved');
        ${asRole('teacher', seededIds.teacher)}
        SELECT 't_lessons='||ppg_module_lessons('module-01')::text;
        SELECT 't_steps='||ppg_lesson_steps('module-01-lesson-01')::text;
        SELECT 't_selfcheck='||ppg_self_check_questions('module-01-lesson-01')::text;
        SELECT 't_mission='||coalesce(ppg_read_mission('module-01')::text, '<null>');
        SELECT 't_practical='||coalesce(ppg_read_practical('module-08')::text, '<null>');
        SELECT 't_history='||count(*) FROM ppg_submission_history('module-08');
        ${asClaims('admin', seededIds.admin)}
        SELECT 'a_lessons='||ppg_module_lessons('module-01')::text;
        SELECT 'a_practical='||coalesce(ppg_read_practical('module-08')::text, '<null>');
      ROLLBACK;`,
    )
    expect(probe(out, 't_lessons').includes('module-01-lesson-01')).toBe(true)
    expect(probe(out, 't_selfcheck').includes('module-01-lesson-01')).toBe(true)
    expect(probe(out, 't_mission').includes('module-01')).toBe(true)
    expect(probe(out, 't_practical').includes('module-08')).toBe(true)
    expect(probe(out, 't_history')).toBe('1')
    expect(probe(out, 'a_lessons').includes('module-01-lesson-01')).toBe(true)
    expect(probe(out, 'a_practical').includes('module-08')).toBe(true)
  },
)

test(
  'Submit paths: self-check, knowledge mission and practical writes reject an archived parent',
  { skip: !hasLocalStack },
  () => {
    // each raise aborts its transaction, so each denial rides its own tx
    const selfCheck = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner)}
        ${asRole('learner', seededIds.learner)}
        SELECT ppg_check_self_check('module-01-lesson-01', '{"1":"a","2":"a"}'::jsonb);
      ROLLBACK;`,
    )
    expect(selfCheck.includes('lesson_not_visible')).toBe(true)

    const mission = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner)}
        ${asRole('learner', seededIds.learner)}
        SELECT ppg_submit_mission('module-01', '{"1":"a","2":"a","3":"a"}'::jsonb);
      ROLLBACK;`,
    )
    expect(mission.includes('mission_not_visible')).toBe(true)

    const upload = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner)}
        ${asRole('learner', seededIds.learner)}
        SELECT ppg_insert_submission('${seededIds.learner}'::uuid, 'module-08', 992,
          'submissions/${seededIds.learner}/module-08/992', 'pptx', 1000, 'archived');
      ROLLBACK;`,
    )
    expect(upload.includes('mission_not_visible')).toBe(true)

    const status = sql(
      `BEGIN;
        DELETE FROM ppg_submissions
         WHERE learner_id = '${seededIds.learner}' AND mission_id = 'module-08' AND submission_seq = 993;
        INSERT INTO ppg_submissions
          (learner_id, mission_id, submission_seq, storage_path, file_magic, file_size, reflection, status)
        VALUES ('${seededIds.learner}', 'module-08', 993,
          'submissions/${seededIds.learner}/module-08/993', 'pptx', 1000, 'archived', 'in_progress');
        ${asRole('learner', seededIds.learner)}
        SELECT ppg_set_submission_status('${seededIds.learner}'::uuid, 'module-08', 993, 'submitted');
      ROLLBACK;`,
    )
    expect(status.includes('mission_not_visible')).toBe(true)

    const download = sql(
      `BEGIN;
        DELETE FROM ppg_submissions
         WHERE learner_id = '${seededIds.learner}' AND mission_id = 'module-08' AND submission_seq = 994;
        INSERT INTO ppg_submissions
          (learner_id, mission_id, submission_seq, storage_path, file_magic, file_size, reflection, status)
        VALUES ('${seededIds.learner}', 'module-08', 994,
          'submissions/${seededIds.learner}/module-08/994', 'pptx', 1000, 'archived', 'approved');
        ${asRole('learner', seededIds.learner)}
        SELECT ppg_signed_url_for('module-08', 994, 60);
      ROLLBACK;`,
    )
    expect(download.includes('denied_or_missing')).toBe(true)
  },
)

test(
  'Active spine: chapter-01 reads and the Knowledge Mission submit still work (no regression)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${gateOpen(seededIds.learner)}
        ${asRole('learner', seededIds.learner)}
        SELECT 'lessons='||ppg_module_lessons('chapter-01')::text;
        SELECT 'steps='||ppg_lesson_steps('chapter-01-lesson-01')::text;
        SELECT 'mini='||ppg_grade_mini_check('chapter-01-lesson-01', 4, 'c')::text;
        SELECT 'mission='||coalesce(ppg_read_mission('chapter-01')::text, '<null>');
        SELECT 'submit='||ppg_submit_mission('chapter-01', '{}'::jsonb)::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'lessons').includes('chapter-01-lesson-01')).toBe(true)
    expect(probe(out, 'steps').includes('"kind"')).toBe(true)
    expect(probe(out, 'mini').includes('"correct": true')).toBe(true)
    expect(probe(out, 'mission').includes('instructions_en')).toBe(true)
    expect(probe(out, 'submit').includes('"module_key": "chapter-01"')).toBe(true)
    expect(probe(out, 'submit').includes('"outcome": "fail"')).toBe(true)
  },
)
