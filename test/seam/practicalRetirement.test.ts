import { test, expect } from 'vitest'
import { execSync } from 'node:child_process'

/**
 * PPGA #85 database-seam tests: the seeded Practical Missions are archived
 * (never deleted), a learner can no longer read/see them, teacher and admin
 * keep the history view, and the historical submission + rubric rows remain
 * readable to an admin. Exercised against the REAL local Postgres the same
 * way the shipped seam tests do — role/claims inside a transaction, ROLLBACK.
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

const ids = {
  admin: '11111111-1111-1111-1111-111111111111',
  teacher: '22222222-2222-2222-2222-222222222222',
  learner: '64110001-0001-0001-0001-000100010001',
}

const sql = (statement: string) =>
  execSync(`docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`, {
    input: statement,
    encoding: 'utf8',
  })

const asRole = (role: string, sub: string) =>
  `SET LOCAL role authenticated; SET LOCAL "request.jwt.claims" = '{"role":"${role}","sub":"${sub}"}';`

const probe = (out: string, label: string) => {
  const start = out.indexOf(`${label}=`)
  if (start === -1) return ''
  const rest = out.slice(start + label.length + 1)
  const next = rest.indexOf('\n')
  return next === -1 ? rest : rest.slice(0, next)
}

test(
  'Archive: every seeded Practical Mission is stamped, none is deleted',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `SELECT 'total=' || count(*) FROM ppg_practical_missions;
       SELECT 'archived=' || count(*) FROM ppg_practical_missions WHERE archived_at IS NOT NULL;
       SELECT 'active=' || count(*) FROM ppg_practical_missions WHERE archived_at IS NULL;`,
    )
    expect(probe(out, 'total')).toBe('4')
    expect(probe(out, 'archived')).toBe('4')
    expect(probe(out, 'active')).toBe('0')
  },
)

test(
  'Learner reads see no archived practical row; teacher/admin keep the history',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        ${asRole('learner', ids.learner)}
        SELECT 'learner_rows=' || count(*) FROM ppg_practical_missions;
        SELECT 'learner_rpc=' || coalesce(ppg_read_practical('module-08')::text, '<null>');
        SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${ids.teacher}"}';
        SELECT 'teacher_rows=' || count(*) FROM ppg_practical_missions;
        SELECT 'teacher_rpc=' || case when ppg_read_practical('module-08') is null then '<null>' else 'row' end;
      ROLLBACK;`,
    )
    expect(probe(out, 'learner_rows')).toBe('0')
    expect(probe(out, 'learner_rpc')).toBe('<null>')
    expect(probe(out, 'teacher_rows')).toBe('4')
    expect(probe(out, 'teacher_rpc')).toBe('row')
  },
)

test(
  'History: an admin still reads submission and rubric rows after the archive',
  { skip: !hasLocalStack },
  () => {
    const out = sql(
      `BEGIN;
        INSERT INTO ppg_submissions
          (learner_id, mission_id, submission_seq, storage_path, file_magic, file_size, reflection, status)
        VALUES ('${ids.learner}', 'module-08', 995,
          'submissions/${ids.learner}/module-08/995', 'pptx', 1000, 'retired-history-probe', 'approved');
        INSERT INTO ppg_rubric_reviews
          (learner_id, mission_id, submission_seq, teacher_id,
           score_content_structure, score_text_formatting, score_images_visual,
           score_slide_design, score_tool_usage, score_creativity, score_completeness,
           total_score, decision, feedback_th, feedback_en)
        VALUES ('${ids.learner}', 'module-08', 995, '${ids.teacher}',
          3, 3, 3, 3, 3, 3, 3, 21, 'approved', 'ok', 'ok');
        ${asRole('admin', ids.admin)}
        SELECT 'admin_submissions=' || count(*) FROM ppg_submissions
         WHERE learner_id = '${ids.learner}' AND mission_id = 'module-08' AND submission_seq = 995;
        SELECT 'admin_reviews=' || count(*) FROM ppg_rubric_reviews
         WHERE learner_id = '${ids.learner}' AND mission_id = 'module-08' AND submission_seq = 995;
      ROLLBACK;`,
    )
    expect(probe(out, 'admin_submissions')).toBe('1')
    expect(probe(out, 'admin_reviews')).toBe('1')
  },
)
