import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * Ticket #84 Final Test seam against the REAL local Postgres: the 50-item /
 * nine-chapter instrument, a complete payload scored server-side, the FIRST
 * attempt preserved as the research measure across retries, the best score
 * exposed by ppg_final_test_state, the one-time 400 XP + final_test_complete
 * reward (idempotent across retries), and answer-key non-disclosure.
 *
 * Hermetic: every test opens its own transaction, clears the learner's
 * attempts/reward in-tx, opens the unlock gate (module-11 complete), then
 * impersonates the learner and ROLLS BACK.
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
  learnerA: '64110001-0001-0001-0001-000100010001',
  learnerB: '64110002-0002-0002-0002-000200020002',
  teacher: '22222222-2222-2222-2222-222222222222',
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

const answerKey = () =>
  sql(`SELECT answer_key::text FROM public.ppg_posttest_instruments
        WHERE version = '${VERSION}';`)
    .trim()
    .split('\n')[0]

const payload = (source: Record<string, string>) =>
  JSON.stringify(source).replaceAll("'", "''")

// Owner-level reset + the unlock gate, then the learner's JWT.
const openFor = (learnerId: string) => `
  BEGIN;
  DELETE FROM public.ppg_posttest_retry_attempts WHERE learner_id = '${learnerId}';
  DELETE FROM public.ppg_posttest_responses WHERE learner_id = '${learnerId}';
  DELETE FROM public.ppg_badge_awards WHERE learner_id = '${learnerId}';
  DELETE FROM public.ppg_xp_ledger WHERE learner_id = '${learnerId}';
  UPDATE public.ppg_module_missions SET status = 'incomplete' WHERE learner_id = '${learnerId}';
  INSERT INTO public.ppg_module_missions (module_key, learner_id, status)
  VALUES ('module-11', '${learnerId}', 'complete')
  ON CONFLICT (module_key, learner_id) DO UPDATE SET status = 'complete';
  SET LOCAL role authenticated;
  SET LOCAL "request.jwt.claims" = '{"role":"learner","sub":"${learnerId}"}';`

test(
  'Instrument: 50 items, nine chapters at 5-6 each, three options per language, 50 keys',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      BEGIN;
      SELECT 'items='||jsonb_array_length(items)
        FROM public.ppg_posttest_instruments WHERE version = '${VERSION}';
      SELECT 'key='||count(*)
        FROM jsonb_object_keys((
          SELECT answer_key FROM public.ppg_posttest_instruments
           WHERE version = '${VERSION}'
        ));
      SELECT 'ch='||(item->>'chapter_key')||'='||count(*)
        FROM public.ppg_posttest_instruments,
             jsonb_array_elements(items) AS item
       WHERE version = '${VERSION}'
       GROUP BY item->>'chapter_key'
       ORDER BY item->>'chapter_key';
      SELECT 'bad_choices='||count(*) FROM (
        SELECT item->>'id' AS id, lang, count(*) AS c
          FROM public.ppg_posttest_instruments,
               jsonb_array_elements(items) AS item,
               (VALUES ('th'::text), ('en'::text)) AS l(lang),
               jsonb_object_keys(item -> l.lang -> 'choices') AS option_key
         WHERE version = '${VERSION}'
         GROUP BY item->>'id', lang
        HAVING count(*) <> 3
      ) bad;
      SELECT 'answers_in_items='||count(*)
        FROM public.ppg_posttest_instruments
       WHERE version = '${VERSION}' AND items::text LIKE '%"answer":%';
      SELECT 'legacy='||count(*) FROM public.ppg_posttest_instruments
       WHERE version = '2026.09.1';
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
    expect(probe(out, 'legacy')).toBe('1')
  },
)

test(
  'Complete payload: all 50 correct answers score 50 and the reward lands once',
  { skip: !hasLocalStack },
  () => {
    const key = JSON.parse(answerKey()) as Record<string, string>
    const out = sql(`
      ${openFor(seededIds.learnerA)}
      SELECT ppg_posttest_start('th');
      SELECT 'score='||ppg_posttest_submit('${payload(key)}'::jsonb)::text;
      RESET ROLE;
      SELECT 'row='||instrument_version||'|'||language||'|'||score::text
        FROM public.ppg_posttest_responses
       WHERE learner_id = '${seededIds.learnerA}'::uuid;
      SELECT 'xp='||coalesce(sum(amount),0)||'|'||count(*)
        FROM public.ppg_xp_ledger
       WHERE learner_id = '${seededIds.learnerA}'::uuid AND event_type = 'final_test_pass';
      SELECT 'badge='||count(*) FROM public.ppg_badge_awards
       WHERE learner_id = '${seededIds.learnerA}'::uuid AND badge_key = 'final_test_complete';
      SELECT 'state='||ppg_final_test_state('${seededIds.learnerA}'::uuid)::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'score')).toBe('50')
    expect(probe(out, 'row')).toBe(`${VERSION}|th|50`)
    expect(probe(out, 'xp')).toBe('400|1')
    expect(probe(out, 'badge')).toBe('1')
    expect(out).toContain('"completed": true')
    expect(out).toContain('"first_score": 50')
    expect(out).toContain('"best_score": 50')
    expect(out).toContain('"attempts": 1')
    expect(out).toContain('"reward_granted": true')
    expect(out).toContain('"reward_xp": 400')
  },
)

test(
  'Retries: the first attempt stays the research measure, the best score shows, the reward stays once',
  { skip: !hasLocalStack },
  () => {
    const key = JSON.parse(answerKey()) as Record<string, string>
    const wrong = Object.fromEntries(
      Object.keys(key).map((name) => [name, 'A']),
    ) as Record<string, string>
    const out = sql(`
      ${openFor(seededIds.learnerA)}
      SELECT ppg_posttest_start('th');
      SELECT 'first='||ppg_posttest_submit('${payload(wrong)}'::jsonb)::text;
      SELECT ppg_posttest_start('th');
      SELECT 'retry='||ppg_posttest_submit('${payload(key)}'::jsonb)::text;
      RESET ROLE;
      SELECT 'research='||score::text FROM public.ppg_posttest_responses
       WHERE learner_id = '${seededIds.learnerA}'::uuid;
      SELECT 'retry_rows='||count(*)||'|'||max(score)::text
        FROM public.ppg_posttest_retry_attempts
       WHERE learner_id = '${seededIds.learnerA}'::uuid;
      SELECT 'xp='||coalesce(sum(amount),0)||'|'||count(*)
        FROM public.ppg_xp_ledger
       WHERE learner_id = '${seededIds.learnerA}'::uuid AND event_type = 'final_test_pass';
      SELECT 'badge='||count(*) FROM public.ppg_badge_awards
       WHERE learner_id = '${seededIds.learnerA}'::uuid AND badge_key = 'final_test_complete';
      SELECT 'state='||ppg_final_test_state('${seededIds.learnerA}'::uuid)::text;
      ROLLBACK;`,
    )
    const first = Number(probe(out, 'first'))
    expect(first).toBeGreaterThan(0)
    expect(first).toBeLessThan(50)
    expect(probe(out, 'retry')).toBe('50')
    // The research row still carries the FIRST score, never the retry's 50.
    expect(probe(out, 'research')).toBe(String(first))
    expect(probe(out, 'retry_rows')).toBe('1|50')
    // The reward was granted once on the first completion; the retry adds 0.
    expect(probe(out, 'xp')).toBe('400|1')
    expect(probe(out, 'badge')).toBe('1')
    expect(out).toContain(`"first_score": ${first}`)
    expect(out).toContain('"best_score": 50')
    expect(out).toContain('"attempts": 2')
  },
)

test(
  'Key non-disclosure: a learner reads items but NOT answer_key',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      ${openFor(seededIds.learnerB)}
      SELECT 'items='||jsonb_array_length(items)
        FROM public.ppg_posttest_instruments WHERE version = '${VERSION}';
      SELECT answer_key FROM public.ppg_posttest_instruments
       WHERE version = '${VERSION}';
      ROLLBACK;`,
    )
    expect(probe(out, 'items')).toBe('50')
    expect(out.toLowerCase()).toContain('permission denied')
  },
)

test(
  'Reward idempotency: a third attempt never grants a second 400 or badge',
  { skip: !hasLocalStack },
  () => {
    const key = JSON.parse(answerKey()) as Record<string, string>
    const out = sql(`
      ${openFor(seededIds.learnerB)}
      SELECT ppg_posttest_start('th');
      SELECT ppg_posttest_submit('${payload(key)}'::jsonb);
      SELECT ppg_posttest_start('th');
      SELECT ppg_posttest_submit('${payload(key)}'::jsonb);
      SELECT ppg_posttest_start('th');
      SELECT ppg_posttest_submit('${payload(key)}'::jsonb);
      RESET ROLE;
      SELECT 'xp='||coalesce(sum(amount),0)||'|'||count(*)
        FROM public.ppg_xp_ledger
       WHERE learner_id = '${seededIds.learnerB}'::uuid AND event_type = 'final_test_pass';
      SELECT 'badge='||count(*) FROM public.ppg_badge_awards
       WHERE learner_id = '${seededIds.learnerB}'::uuid AND badge_key = 'final_test_complete';
      SELECT 'attempts='||(SELECT count(*) FROM public.ppg_posttest_retry_attempts
       WHERE learner_id = '${seededIds.learnerB}'::uuid);
      SELECT 'state='||ppg_final_test_state('${seededIds.learnerB}'::uuid)::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'xp')).toBe('400|1')
    expect(probe(out, 'badge')).toBe('1')
    expect(probe(out, 'attempts')).toBe('2')
    expect(out).toContain('"attempts": 3')
    expect(out).toContain('"best_score": 50')
  },
)
