import { test, expect } from 'vitest'

import { execSync } from 'node:child_process'

/**
 * PPGA #86: `ppg_posttest_unlocked` after the CAI pivot. The retired #15 rule
 * (module-11 complete) could never fire once #85 removed the Practical Final
 * Project, so the Final Test was unreachable. The new rule unlocks after all
 * nine chapters are cleared (nine distinct `chapter-NN` rows in
 * ppg_chapter_unlocks — the next-chapter record a 70% post-test writes), with
 * the legacy module-11 completion kept as a historical fallback.
 *
 * Hermetic: every test opens its own transaction, clears the learner's
 * unlocks and module-11 row in-tx, then ROLLS BACK.
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

const probe = (out: string, label: string) => {
  const start = out.indexOf(`${label}=`)
  if (start === -1) return ''
  const rest = out.slice(start + label.length + 1)
  const next = rest.indexOf('\n')
  return next === -1 ? rest : rest.slice(0, next)
}

/** Pass N chapters as the submit path does: each pass records the NEXT key. */
const passChapters = (count: number) =>
  Array.from({ length: count }, (_, i) => {
    const next = `chapter-${String(i + 2).padStart(2, '0')}`
    return `INSERT INTO public.ppg_chapter_unlocks
      (learner_id, chapter_key, unlocked_by_score, item_count)
      VALUES ('${learner}', '${next}', 7, 10)
      ON CONFLICT (learner_id, chapter_key) DO NOTHING;`
  }).join('\n')

const reset = `
  BEGIN;
  DELETE FROM public.ppg_chapter_unlocks WHERE learner_id = '${learner}';
  UPDATE public.ppg_module_missions SET status = 'incomplete' WHERE learner_id = '${learner}';`

test(
  'Final Test locked with 0 and 8 cleared chapters',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      ${reset}
      SELECT 'zero='||public.ppg_posttest_unlocked('${learner}'::uuid)::text;
      ${passChapters(8)}
      SELECT 'eight='||public.ppg_posttest_unlocked('${learner}'::uuid)::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'zero')).toBe('false')
    expect(probe(out, 'eight')).toBe('false')
  },
)

test(
  'Final Test unlocked after all nine chapters are cleared',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      ${reset}
      ${passChapters(9)}
      SELECT 'nine='||public.ppg_posttest_unlocked('${learner}'::uuid)::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'nine')).toBe('true')
  },
)

test(
  'Legacy module-11 completion still unlocks (historical learners)',
  { skip: !hasLocalStack },
  () => {
    const out = sql(`
      ${reset}
      INSERT INTO public.ppg_module_missions (module_key, learner_id, status)
      VALUES ('module-11', '${learner}', 'complete')
      ON CONFLICT (module_key, learner_id) DO UPDATE SET status = 'complete';
      SELECT 'legacy='||public.ppg_posttest_unlocked('${learner}'::uuid)::text;
      ROLLBACK;`,
    )
    expect(probe(out, 'legacy')).toBe('true')
  },
)
