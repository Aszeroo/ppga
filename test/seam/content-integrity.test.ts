import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #62 content-integrity tests: the seeded content the Learner
 * actually sees is asserted against the live local Postgres (the same
 * `docker exec psql` seam `knowledge-content.test.ts` uses — no new seam).
 *
 * The coverage rules:
 *   - every PUBLISHED Lesson has >=2 Self-Check questions, each exactly 3
 *     options a/b/c with EXACTLY ONE `is_correct`;
 *   - every Module 1-7 Knowledge Mission has >=3 questions x 3 options with
 *     exactly one correct option;
 *   - the current Pre-Test and Post-Test exist, carry the same version and
 *     the same item count (the documented pairing);
 *   - the Satisfaction Survey exists and carries no answer key (the column
 *     does not exist and no item embeds an `answer`);
 *   - no seed-marker placeholder survives in any seeded Thai column.
 *
 * The final probe shells out to `scripts/validate-content.py --mode live`:
 * that script OWNS the structural Thai rules (it imports them from
 * `scripts/validate-thai.py`), so the suite proves the exact same gate CI
 * runs rather than forking the rules into TypeScript.
 *
 * Real instrument COPY is a #61 deliverable (owner/advisor content review).
 * Until it lands, the seeded 2026.09.1 instruments are structural
 * placeholders: the assertions that they are REAL content are explicitly
 * skipped below and reported as outstanding #61 items.
 *
 * Guarded: without a live local stack (`supabase status` reachable) every
 * DB probe skips, matching the repo's seam convention; CI's Typecheck job
 * still runs the Python validator deterministically via the replayer.
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

const sql = (statement: string) =>
  execSync(`docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`, {
    input: statement,
    encoding: 'utf8',
  })

const probe = (out: string, label: string) => {
  const start = out.indexOf(`${label}=`)
  if (start === -1) return ''
  const rest = out.slice(start + label.length + 1)
  const next = rest.indexOf('\n')
  return next === -1 ? rest : rest.slice(0, next)
}

// The seeded content tables and their Thai-bearing columns (user-generated
// runtime columns such as responses/submissions feedback are NOT seeds).
const CONTENT_COLUMNS: Array<[string, string[]]> = [
  ['ppg_skill_domains', ['label_th']],
  ['ppg_courses', ['title_th']],
  ['ppg_course_content', ['title_th']],
  ['ppg_modules', ['title_th', 'summary_th']],
  ['ppg_lessons', ['title_th', 'what_learn_th', 'why_th', 'body_th', 'what_next_th']],
  ['ppg_practical_missions', ['scenario_th', 'requirements_th', 'expected_out_th']],
  ['ppg_rubric_criteria', ['label_th']],
  ['ppg_rub_descriptors', ['descriptor_th']],
  ['ppg_badge_types', ['label_th', 'award_rule_th']],
  ['ppg_knowledge_missions', ['instructions_th']],
  ['ppg_knowledge_mission_questions', ['prompt_th', 'option_th', 'explanation_th', 'review_th']],
  ['ppg_self_check_questions', ['prompt_th', 'option_th']],
]

// The seed-marker shapes (identical to knowledge-content.test.ts / the
// Python validator): `placeholder-02`, `placeholder question`,
// `option-a (placeholder`. The bare word "placeholder" is legitimate
// PowerPoint vocabulary and stays legal.
const MARKER_A = 'placeholder[[:space:]]*[-_]?[[:space:]]*(question|[0-9]+)'
const MARKER_B = 'option-[abc][[:space:]]*[(]placeholder'

test(
  'Self-Check coverage: every PUBLISHED Lesson has >=2 questions x exactly 3 options a/b/c with EXACTLY one is_correct',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      SELECT 'published='||count(*) FROM ppg_lessons WHERE publication_state = 'published';
      SELECT 'bad_coverage='||count(*) FROM ppg_lessons l
       WHERE l.publication_state = 'published'
         AND (SELECT count(DISTINCT q.order_index)
                FROM ppg_self_check_questions q
               WHERE q.lesson_key = l.lesson_key) < 2;
      SELECT 'bad_options='||count(*) FROM (
        SELECT lesson_key, order_index
          FROM ppg_self_check_questions
         GROUP BY lesson_key, order_index
        HAVING count(*) <> 3 OR count(DISTINCT option_key) <> 3
            OR bool_and(option_key IN ('a','b','c')) IS NOT TRUE
      ) x;
      SELECT 'bad_key='||count(*) FROM (
        SELECT lesson_key, order_index
          FROM ppg_self_check_questions
         GROUP BY lesson_key, order_index
        HAVING count(*) FILTER (WHERE is_correct) <> 1
      ) y;
      SELECT 'orphan_banks='||count(*) FROM (
        SELECT DISTINCT lesson_key FROM ppg_self_check_questions
      ) b LEFT JOIN ppg_lessons l ON l.lesson_key = b.lesson_key
       WHERE l.lesson_key IS NULL;
    `)
    expect(Number(probe(out, 'published'))).toBeGreaterThan(0)
    expect(probe(out, 'bad_coverage')).toBe('0')
    expect(probe(out, 'bad_options')).toBe('0')
    expect(probe(out, 'bad_key')).toBe('0')
    expect(probe(out, 'orphan_banks')).toBe('0')
  },
)

test(
  'Knowledge Mission coverage: Modules 1-7 each carry >=3 questions x 3 options a/b/c with EXACTLY one is_correct',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      SELECT 'missions='||count(*) FROM ppg_knowledge_missions
       WHERE module_key IN ('module-01','module-02','module-03','module-04','module-05','module-06','module-07');
      SELECT 'thin='||count(*) FROM (
        SELECT module_key FROM ppg_knowledge_mission_questions
         WHERE module_key LIKE 'module-0%'
         GROUP BY module_key
        HAVING count(DISTINCT order_index) < 3
      ) t;
      SELECT 'bad_options='||count(*) FROM (
        SELECT module_key, order_index
          FROM ppg_knowledge_mission_questions
         GROUP BY module_key, order_index
        HAVING count(*) <> 3 OR count(DISTINCT option_key) <> 3
            OR bool_and(option_key IN ('a','b','c')) IS NOT TRUE
      ) x;
      SELECT 'bad_key='||count(*) FROM (
        SELECT module_key, order_index
          FROM ppg_knowledge_mission_questions
         GROUP BY module_key, order_index
        HAVING count(*) FILTER (WHERE is_correct) <> 1
      ) y;
    `)
    expect(probe(out, 'missions')).toBe('7')
    expect(probe(out, 'thin')).toBe('0')
    expect(probe(out, 'bad_options')).toBe('0')
    expect(probe(out, 'bad_key')).toBe('0')
  },
)

test(
  'Instrument structure: Pre-Test and Post-Test share one version + item count; the Survey exists with no answer key',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      SELECT 'pre='||version||'|'||jsonb_array_length(items) FROM ppg_pretest_instruments ORDER BY version;
      SELECT 'post='||version||'|'||jsonb_array_length(items) FROM ppg_posttest_instruments ORDER BY version;
      SELECT 'survey='||version||'|'||jsonb_array_length(items) FROM ppg_survey_instruments ORDER BY version;
      SELECT 'survey_key_cols='||count(*) FROM information_schema.columns
       WHERE table_schema = 'public' AND table_name = 'ppg_survey_instruments'
         AND column_name = 'answer_key';
      SELECT 'survey_answer_fixture='||count(*) FROM ppg_survey_instruments
       WHERE items::text ILIKE '%"answer"%';
    `)
    const pre = probe(out, 'pre')
    const post = probe(out, 'post')
    const survey = probe(out, 'survey')
    // both instruments exist and are a matched pair (version + item count)
    expect(pre).not.toBe('')
    expect(post).not.toBe('')
    expect(pre).toBe(post)
    // the satisfaction survey exists for the same instrument version
    expect(survey).not.toBe('')
    expect(survey.split('|')[0]).toBe(pre.split('|')[0])
    // a survey never scores anything: no key column, no answer field.
    expect(probe(out, 'survey_key_cols')).toBe('0')
    expect(probe(out, 'survey_answer_fixture')).toBe('0')
  },
)

test(
  'No seed-marker placeholder survives in any seeded Thai column',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      ${CONTENT_COLUMNS.map(
        ([table, columns]) =>
          `SELECT 'm-${table}='||count(*) FROM public.${table}
       WHERE ${columns
         .map((c) => `${c} ~* '${MARKER_A}' OR ${c} ~* '${MARKER_B}'`)
         .join('\n          OR ')};`,
      ).join('\n      ')}
    `)
    for (const [table] of CONTENT_COLUMNS) {
      expect(probe(out, `m-${table}`), `${table} carries a seed-marker`).toBe('0')
    }
  },
)

test(
  'No Thai structural findings in the seeded content (the shared validate-thai rules)',
  { skip: !hasLocalStack, timeout: 30_000 },
  () => {
    let status = 0
    let output = ''
    try {
      output = execSync('python3 scripts/validate-content.py --mode live', {
        encoding: 'utf8',
        stdio: 'pipe',
      })
    } catch (error) {
      status = (error as { status?: number }).status ?? 1
      output = String((error as { stdout?: string }).stdout ?? '')
    }
    expect(status, output).toBe(0)
    expect(output).toContain('0 finding(s)')
  },
)

// The seed's 2026.09.1 instruments are STRUCTURAL placeholders by design
// (single sample Pre/Post items; the Thai Pre-Test prompt is still English
// in both language slots). Replacing them with advisor-approved real
// instruments is ticket #61, which is owner/advisor-gated — so the
// real-content assertions are skipped here and reported as #61 outstanding.
test.skip('TODO #61 — Pre/Post-Test items carry real, distinct, advisor-approved Thai/English content', () => {
  // When #61 lands, assert: >=1 item per instrument, every item's th and en
  // prompts differ and are non-empty, and the Pre-Test prompt is no longer
  // the English sample copy.
})

test.skip('TODO #61 — Satisfaction Survey items carry real, advisor-approved Thai/English content', () => {
  // When #61 lands, assert: >=2 items, every item's th/en prompt non-empty,
  // and the survey remains answer-key-free (the structure probe above).
})
