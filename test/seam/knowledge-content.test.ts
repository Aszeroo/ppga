import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #59 content-integrity tests: the REAL seeded Knowledge Mission
 * bank (7 Modules x 3 questions x 3 options = 63 rows) is asserted against
 * the live local Postgres — every Module carries at least 3 distinct
 * `order_index` questions, every question has exactly the 3 option rows
 * a/b/c with EXACTLY ONE `is_correct` (the server-side key the submit
 * function sums), every bilingual column (prompt/option/explanation/review
 * on every row, instructions on every Mission) is non-empty, and NO
 * placeholder MARKER survives anywhere.
 *
 * The marker check is deliberately NOT the bare word `placeholder` — the
 * word is legitimate PowerPoint vocabulary ("text placeholder" is the real
 * name of a layout element) and appears in the authored English copy. Only
 * the seed's marker shapes are forbidden: `placeholder-NN:` /
 * `placeholder question` (the 20260926000800 placeholder prompts) and
 * `option-a (placeholder…` (the placeholder options). The positive
 * distinction is documented by the vocab probe below.
 *
 * EVERY probe is READ-ONLY (SELECTs only — no writes, no transaction) and
 * LABELLED, `-tA` printing VALUES ONLY, the same shape `missions.test.ts`
 * prescribes. Guarded: without a live local stack (`supabase status`
 * reachable) the tests skip so CI (no credentials, no Postgres) stays green.
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

const MODULES = ['module-01', 'module-02', 'module-03', 'module-04', 'module-05', 'module-06', 'module-07']

// the question columns carrying content (the 20260926000800 table shape;
// prompt/review repeat per option row, so every column is checked per row).
const Q_COLS = [
  'prompt_th', 'prompt_en', 'option_th', 'option_en',
  'explanation_th', 'explanation_en', 'review_th', 'review_en',
]

// the placeholder MARKERS the seed shipped (case-insensitive; the POSIX
// classes keep the regex backslash-free inside the JS template):
//   placeholder-02: / placeholder question — the placeholder prompts
//   option-a (placeholder — the placeholder options
const MARKER_A = 'placeholder[[:space:]]*[-_]?[[:space:]]*(question|[0-9]+)'
const MARKER_B = 'option-[abc][[:space:]]*[(]placeholder'

const markerOr = (cols: string[]) =>
  cols.map((c) => `${c} ~* '${MARKER_A}' OR ${c} ~* '${MARKER_B}'`).join('\n        OR ')

const sql = (statement: string) =>
  execSync(
    `docker exec -i supabase_db_ppga psql -U postgres -tA 2>&1`,
    { input: statement, encoding: 'utf8' },
  )

// the value of one LABELLED probe (one `-tA` line, `label=...`).
const probe = (out: string, label: string) => {
  const start = out.indexOf(`${label}=`)
  if (start === -1) return ''
  const rest = out.slice(start + label.length + 1)
  const next = rest.indexOf('\n')
  return next === -1 ? rest : rest.slice(0, next)
}

test(
  'Bank shape: Modules 1-7 each carry >=3 distinct questions, every question exactly 3 option rows a/b/c with EXACTLY one is_correct (the server-side key)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      SELECT 'modules='||count(DISTINCT module_key) FROM ppg_knowledge_mission_questions;
      ${MODULES.map(
        (mk) =>
          `SELECT 'q-${mk}='||count(DISTINCT order_index) FROM ppg_knowledge_mission_questions WHERE module_key = '${mk}';`,
      ).join('\n      ')}
      SELECT 'bad_opts='||count(*) FROM (
        SELECT module_key, order_index
          FROM ppg_knowledge_mission_questions
         GROUP BY module_key, order_index
        HAVING count(*) <> 3 OR count(DISTINCT option_key) <> 3
            OR bool_and(option_key IN ('a','b','c')) IS NOT TRUE
      ) x;
      SELECT 'bad_key='||count(*) FROM (
        SELECT module_key, order_index, count(*) FILTER (WHERE is_correct) AS k
          FROM ppg_knowledge_mission_questions
         GROUP BY module_key, order_index
        HAVING count(*) FILTER (WHERE is_correct) <> 1
      ) y;
      SELECT 'total_rows='||count(*) FROM ppg_knowledge_mission_questions;
    `)
    // the Mission bank exists for ALL 7 Modules (the unlock/XP gate reads it).
    expect(probe(out, 'modules')).toBe('7')
    for (const mk of MODULES) {
      expect(Number(probe(out, `q-${mk}`))).toBeGreaterThanOrEqual(3)
    }
    // every question: exactly 3 option rows, keys a/b/c, ONE correct.
    expect(probe(out, 'bad_opts')).toBe('0')
    expect(probe(out, 'bad_key')).toBe('0')
    // 7 Modules x 3 questions x 3 options = 63 rows (the authored bank).
    expect(probe(out, 'total_rows')).toBe('63')
  },
)

test(
  'Bilingual copy: every content column non-empty on every question row and both instruction columns on every Mission (no blank TH/EN anywhere)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      SELECT 'empty_q='||count(*) FROM ppg_knowledge_mission_questions
       WHERE ${Q_COLS.map((c) => `length(btrim(${c})) = 0`).join('\n          OR ')};
      SELECT 'empty_i='||count(*) FROM ppg_knowledge_missions
       WHERE length(btrim(instructions_th)) = 0 OR length(btrim(instructions_en)) = 0;
      SELECT 'missions='||count(*) FROM ppg_knowledge_missions
       WHERE module_key IN (${MODULES.map((m) => `'${m}'`).join(', ')});
    `)
    expect(probe(out, 'empty_q')).toBe('0')
    expect(probe(out, 'empty_i')).toBe('0')
    // one Mission per Module with its bilingual instructions (the #59 upsert).
    expect(probe(out, 'missions')).toBe('7')
  },
)

test(
  'No placeholder marker: neither seed marker shape survives in any question column or instruction (the bare word "placeholder" stays legal PowerPoint vocabulary — the vocab probe says so)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      SELECT 'marker_q='||count(*) FROM ppg_knowledge_mission_questions
       WHERE ${markerOr(Q_COLS)};
      SELECT 'marker_i='||count(*) FROM ppg_knowledge_missions
       WHERE ${markerOr(['instructions_th', 'instructions_en'])};
      -- the POSITIVE control: the authored English DOES use the word
      -- "placeholder" as real PowerPoint vocabulary ("text placeholders" —
      -- the Blank layout question). This is what the marker check above
      -- must NOT catch; a regression that banned the bare word would break
      -- this line and be caught in review.
      SELECT 'vocab_rows='||count(*) FROM ppg_knowledge_mission_questions
       WHERE concat_ws(' ', ${Q_COLS.map((c) => `${c}::text`).join(', ')}) ILIKE '%placeholder%';
    `)
    expect(probe(out, 'marker_q')).toBe('0')
    expect(probe(out, 'marker_i')).toBe('0')
    expect(Number(probe(out, 'vocab_rows'))).toBeGreaterThan(0)
  },
)
