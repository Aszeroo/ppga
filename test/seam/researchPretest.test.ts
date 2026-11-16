import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #83 research pre-test seam: the authored 2026.11.1 instrument is
 * asserted against the REAL local Postgres. The tests cover the 50-item /
 * nine-chapter blueprint, server-side scoring, the version recorded on the
 * new response row, rejection of a second attempt, answer-key non-disclosure
 * at the column-level grant, and that the research export carries the new
 * version.
 *
 * Hermetic: every test opens its own transaction, resets the learner's
 * response/consent in-tx, impersonates via `SET LOCAL role authenticated` +
 * JWT claims, then ROLLBACK. No residue in the shared container.
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

const VERSION = '2026.11.1'
const seededIds = {
  admin: '11111111-1111-1111-1111-111111111111',
  teacher: '22222222-2222-2222-2222-222222222222',
  learner: '64110001-0001-0001-0001-000100010001',
}

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

const ownerReset = (learnerId: string) => `
  DELETE FROM ppg_pretest_responses WHERE learner_id = '${learnerId}';
  UPDATE ppg_profiles SET consent = false, prettest_unlocked_override = false
   WHERE id = '${learnerId}';`

const openLearner = (learnerId: string) => `
  ${ownerReset(learnerId)}
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claims" = '{"role":"admin","sub":"${seededIds.admin}"}';
  SELECT ppg_set_consent('${learnerId}'::uuid, true);
  SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${learnerId}"}';`

const answerKey = () =>
  sql(`SELECT answer_key::text FROM public.ppg_pretest_instruments
        WHERE version = '${VERSION}';`)
    .trim()
    .split('\n')[0]

test(
  'Instrument: 50 items, nine chapters at 5-6 each, three options per language, 50 keys',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      BEGIN;
      SELECT 'items='||jsonb_array_length(items)
        FROM public.ppg_pretest_instruments WHERE version = '${VERSION}';
      SELECT 'key='||count(*)
        FROM jsonb_object_keys((
          SELECT answer_key FROM public.ppg_pretest_instruments
           WHERE version = '${VERSION}'
        ));
      SELECT 'ch='||(item->>'chapter_key')||'='||count(*)
        FROM public.ppg_pretest_instruments,
             jsonb_array_elements(items) AS item
       WHERE version = '${VERSION}'
       GROUP BY item->>'chapter_key'
       ORDER BY item->>'chapter_key';
      SELECT 'bad_choices='||count(*) FROM (
        SELECT item->>'id' AS id, lang, count(*) AS c
          FROM public.ppg_pretest_instruments,
               jsonb_array_elements(items) AS item,
               (VALUES ('th'::text), ('en'::text)) AS l(lang),
               jsonb_object_keys(item -> l.lang -> 'choices') AS option_key
         WHERE version = '${VERSION}'
         GROUP BY item->>'id', lang
        HAVING count(*) <> 3
      ) bad;
      SELECT 'answers_in_items='||count(*)
        FROM public.ppg_pretest_instruments
       WHERE version = '${VERSION}' AND items::text LIKE '%"answer":%';
      ROLLBACK;`,
    )
    expect(probe(out, 'items')).toBe('50')
    expect(probe(out, 'key')).toBe('50')
    for (let n = 1; n <= 9; n += 1) {
      const chapter = `chapter-${String(n).padStart(2, '0')}`
      const count = Number(probe(out, `ch=${chapter}`))
      expect(count, chapter).toBeGreaterThanOrEqual(5)
      expect(count, chapter).toBeLessThanOrEqual(6)
    }
    expect(probe(out, 'bad_choices')).toBe('0')
    expect(probe(out, 'answers_in_items')).toBe('0')
  },
)

test(
  'Submit + score + version: an all-correct submission scores 50 and records 2026.11.1',
  { skip: !hasLocalStack },
  () => {
    const key = answerKey()
    const out = sql(`
      BEGIN;
      ${openLearner(seededIds.learner)}
      SELECT ppg_prettest_start('th');
      SELECT ppg_prettest_submit('${key.replace(/'/g, "''")}'::jsonb);
      RESET ROLE;
      SELECT 'row='||instrument_version||'|'||language||'|'||score::text
        FROM ppg_pretest_responses
       WHERE learner_id = '${seededIds.learner}'::uuid;
      ROLLBACK;`,
    )
    expect(out).toContain(`row=${VERSION}|th|50`)
  },
)

test(
  'Second attempt: the single response row cannot be submitted twice',
  { skip: !hasLocalStack },
  () => {
    const key = answerKey()
    const out = sql(`
      BEGIN;
      ${openLearner(seededIds.learner)}
      SELECT ppg_prettest_start('th');
      SELECT ppg_prettest_submit('${key.replace(/'/g, "''")}'::jsonb);
      SELECT ppg_prettest_submit('${key.replace(/'/g, "''")}'::jsonb);
      ROLLBACK;`,
    )
    expect(out).toContain('already_submitted_or_missing')
  },
)

test(
  'Key non-disclosure: a consenting learner reads items but not answer_key; unconsented reads no row',
  { skip: !hasLocalStack },
  () => {
    const consenting = sql(`
      BEGIN;
      ${openLearner(seededIds.learner)}
      SELECT 'items='||jsonb_array_length(items)
        FROM public.ppg_pretest_instruments WHERE version = '${VERSION}';
      SELECT answer_key FROM public.ppg_pretest_instruments
       WHERE version = '${VERSION}';
      ROLLBACK;`,
    )
    expect(probe(consenting, 'items')).toBe('50')
    expect(consenting.toLowerCase()).toContain('permission denied')

    const unconsented = sql(`
      BEGIN;
      ${ownerReset(seededIds.learner)}
      SET LOCAL role authenticated;
      SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${seededIds.learner}"}';
      SELECT 'rows='||count(*) FROM public.ppg_pretest_instruments
       WHERE version = '${VERSION}';
      ROLLBACK;`,
    )
    expect(probe(unconsented, 'rows')).toBe('0')
  },
)

test(
  'Research export: the new instrument version appears in the export rows',
  { skip: !hasLocalStack },
  () => {
    const key = answerKey()
    const out = sql(`
      BEGIN;
      ${openLearner(seededIds.learner)}
      SELECT ppg_prettest_start('th');
      SELECT ppg_prettest_submit('${key.replace(/'/g, "''")}'::jsonb);
      SET LOCAL "request.jwt.claims" = '{"role":"teacher","sub":"${seededIds.teacher}"}';
      SELECT 'export='||((ppg_research_export('csv')->'rows')::text LIKE '%${VERSION}%');
      ROLLBACK;`,
    )
    expect(probe(out, 'export')).toBe('true')
  },
)
