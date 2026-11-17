import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #84 static guards (no DB needed): the Final Test is a NEW
 * instrument version (the legacy 2026.09.1 placeholder is untouched), exactly
 * 50 bilingual items covering all nine chapters, interleaved, with the SAME
 * objective_key set as the #83 research Pre-Test, three A/B/C options per
 * item, a 50-entry server-side key and no answer field inside the items.
 * It also pins the key non-disclosure grant, the retry model (first attempt
 * in ppg_posttest_responses, retries appended), the one-time reward call in
 * the submit definer, and the end-of-course state RPC.
 */
const base = process.cwd()
const migration = readFileSync(
  `${base}/supabase/migrations/20261116001100_final_test_reward.sql`,
  'utf8',
)
const pretestMigration = readFileSync(
  `${base}/supabase/migrations/20261116001000_research_pretest.sql`,
  'utf8',
)
const lib = readFileSync(`${base}/lib/sup/posttest.ts`, 'utf8')

function instrument(source: string) {
  const match = source.match(
    /values \(\s*'2026\.11\.1',\s*'(\[[\s\S]*?\])'::jsonb,\s*'(\{[\s\S]*?\})'::jsonb\s*\)/,
  )
  if (!match) throw new Error('2026.11.1 instrument literal not found')
  return {
    items: JSON.parse(match[1].replaceAll("''", "'")) as Array<{
      id: string
      chapter_key: string
      objective_key: string
      th: { prompt: string; choices: Record<string, string> }
      en: { prompt: string; choices: Record<string, string> }
    }>,
    key: JSON.parse(match[2].replaceAll("''", "'")) as Record<string, string>,
  }
}

const final = instrument(migration)
const pre = instrument(pretestMigration)
const CHAPTERS = Array.from({ length: 9 }, (_, i) => `chapter-${String(i + 1).padStart(2, '0')}`)

test('Instrument: a new version with exactly 50 items and a 50-entry key', () => {
  expect(migration).toContain("'2026.11.1'")
  // The legacy placeholder is never mutated by this migration.
  expect(migration.includes("'2026.09.1'")).toBe(false)
  expect(migration.includes('delete from public.ppg_posttest_instruments')).toBe(false)
  expect(final.items).toHaveLength(50)
  expect(Object.keys(final.key)).toHaveLength(50)
  expect(final.items.map((item) => item.id)).toEqual(
    Array.from({ length: 50 }, (_, i) => `item_${i + 1}`),
  )
  // The key and the item ids are the same shape the form posts.
  expect(Object.keys(final.key).sort()).toEqual(final.items.map((item) => item.id).sort())
  expect(migration.includes('"answer":')).toBe(false)
})

test('Blueprint: all nine chapters, 5-6 items each, interleaved with no grouped block', () => {
  const counts = new Map<string, number>()
  for (const item of final.items) counts.set(item.chapter_key, (counts.get(item.chapter_key) ?? 0) + 1)
  expect([...counts.keys()].sort()).toEqual(CHAPTERS)
  for (const chapter of CHAPTERS) {
    const count = counts.get(chapter) ?? 0
    expect(count, chapter).toBeGreaterThanOrEqual(5)
    expect(count, chapter).toBeLessThanOrEqual(6)
  }
  for (let i = 1; i < final.items.length; i += 1) {
    expect(final.items[i].chapter_key).not.toBe(final.items[i - 1].chapter_key)
  }
})

test('Blueprint parity: the exact objective_key set of the research Pre-Test', () => {
  const pairs = (items: typeof final.items) =>
    new Set(items.map((item) => `${item.chapter_key}/${item.objective_key}`))
  expect(pairs(final.items)).toEqual(pairs(pre.items))
  // Every final item maps to one objective, and no pair repeats.
  expect(pairs(final.items).size).toBe(50)
})

test('Items: bilingual, three A/B/C options per language, one key letter each', () => {
  for (const item of final.items) {
    for (const lang of ['th', 'en'] as const) {
      expect(item[lang].prompt.length, `${item.id}/${lang} prompt`).toBeGreaterThan(0)
      expect(Object.keys(item[lang].choices).sort(), `${item.id}/${lang} choices`).toEqual([
        'A',
        'B',
        'C',
      ])
    }
    expect(['A', 'B', 'C']).toContain(final.key[item.id])
  }
})

test('Key non-disclosure: client SELECT on answer_key is revoked, items stays readable', () => {
  expect(migration).toContain(
    'revoke select on public.ppg_posttest_instruments from anon, authenticated',
  )
  expect(migration).toContain(
    'grant select (version, items) on public.ppg_posttest_instruments to authenticated',
  )
  const grant = migration.match(/grant select \([^)]*\) on public\.ppg_posttest_instruments/)
  expect(grant?.[0]).not.toContain('answer_key')
})

test('Retries: the research row is attempt one, retries append, each submitted row is immutable', () => {
  expect(migration).toContain('create table public.ppg_posttest_retry_attempts')
  expect(migration).toContain('attempt_no >= 2')
  expect(migration).toContain('ppg_posttest_retry_immutable')
  expect(migration).toContain('and r.submitted_at IS NULL')
  expect(migration).toContain('on conflict (learner_id) do nothing')
  // The first-attempt table keeps its single-row PK; the migration never
  // changes its primary key.
  expect(migration.includes('alter table public.ppg_posttest_responses')).toBe(false)
  expect(migration).toContain('ppg_final_test_state')
})

test('Reward: the submit definer calls the #76 helper exactly once, never the client', () => {
  const submitStart = migration.indexOf('create or replace function public.ppg_posttest_submit')
  const submitEnd = migration.indexOf('revoke execute on function public.ppg_posttest_submit')
  const submitBody = migration.slice(submitStart, submitEnd)
  expect(submitBody.match(/ppg_grant_final_test_reward/g)).toHaveLength(1)
  expect(submitBody).toContain("'final-test'")
  // This migration never grants the helper to a client role.
  expect(migration).not.toContain(
    'grant execute on function public.ppg_grant_final_test_reward(uuid, text)\n  to authenticated',
  )
})

test('Screen: the items read follows the version the starter records; retry state is read', () => {
  expect(lib).toContain(".order('version', { ascending: false })")
  expect(lib).toContain('ppg_final_test_state')
  expect(lib).toContain('readFinalTestState')
  expect(lib).toContain('best_score')
})
