import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * PPGA #86 static guard (no DB needed): the later migration replaces
 * `ppg_posttest_unlocked` with BOTH rules — all nine chapters cleared (nine
 * distinct `chapter-NN` rows in ppg_chapter_unlocks) OR the legacy module-11
 * completion — while keeping the definer, search_path, signature and grants.
 * The old #15 migration stays untouched as history.
 */
const base = process.cwd()
const newMigration = readFileSync(
  `${base}/supabase/migrations/20261117000300_final_test_unlock_cai.sql`,
  'utf8',
)
const oldMigration = readFileSync(
  `${base}/supabase/migrations/20260926001200_final_project_posttest_survey.sql`,
  'utf8',
)

test('the later migration replaces the gate with the CAI rule + the legacy fallback', () => {
  expect(
    newMigration.includes('create or replace function public.ppg_posttest_unlocked(p_learner uuid)'),
  ).toBe(true)
  // CAI: nine distinct chapter-NN rows.
  expect(newMigration).toContain('from public.ppg_chapter_unlocks u')
  expect(newMigration).toContain('count(distinct u.chapter_key)')
  expect(newMigration).toContain("u.chapter_key ~ '^chapter-[0-9]{2}$'")
  expect(newMigration).toContain(') >= 9;')
  // Legacy: module-11 complete stays.
  expect(newMigration).toContain("mi.module_key = 'module-11'")
  expect(newMigration).toContain("mi.status = 'complete'")
})

test('the definer, search_path, signature and grants are preserved', () => {
  expect(newMigration).toContain('language sql')
  expect(newMigration).toContain('security definer')
  expect(newMigration).toContain('set search_path = public, auth')
  expect(newMigration).toContain('returns boolean')
  expect(newMigration).toContain(
    'revoke execute on function public.ppg_posttest_unlocked(uuid)\n  from public, anon, authenticator, supabase_auth_admin;',
  )
  expect(newMigration).toContain(
    'grant execute on function public.ppg_posttest_unlocked(uuid)\n  to service_role, authenticated;',
  )
})

test('the comment states both rules and the old migration is untouched', () => {
  expect(newMigration).toContain('all nine chapters cleared')
  expect(newMigration).toContain('legacy `module-11`')
  // #15's file remains the historical definition (never edited in place).
  expect(oldMigration).toContain("mi.module_key = 'module-11'")
})
