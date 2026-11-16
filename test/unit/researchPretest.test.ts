import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #83 static guards (no DB needed): the authored research pre-test is a
 * NEW instrument version (the legacy 2026.09.1 sample is untouched), exactly
 * 50 bilingual items with `chapter_key` + `objective_key`, 5-6 items per
 * chapter interleaved rather than grouped, three A/B/C options per item, a
 * 50-entry server-side answer key and no answer field inside the items. It
 * also pins the column-level grant that keeps `answer_key` out of client
 * reads, and the items read that follows the recorded version.
 */
const base = process.cwd()
const migrationPath = 'supabase/migrations/20261116001000_research_pretest.sql'
const migration = readFileSync(`${base}/${migrationPath}`, 'utf8')
const lib = readFileSync(`${base}/lib/sup/prettest.ts`, 'utf8')

const CHAPTERS = Array.from({ length: 9 }, (_, i) => `chapter-${String(i + 1).padStart(2, '0')}`)

const chapterSequence = [...migration.matchAll(/"chapter_key": "(chapter-\d{2})"/g)].map(
  (match) => match[1],
)

test('Instrument: a new version with 50 items and a 50-entry server-side key', () => {
  expect(migration.includes("values (\n  '2026.11.1'")).toBe(true)
  expect(chapterSequence).toHaveLength(50)
  expect([...migration.matchAll(/"item_\d+": "[ABC]"/g)]).toHaveLength(50)
  // 50 items x 2 languages x 3 letters.
  expect([...migration.matchAll(/"A": "/g)]).toHaveLength(100)
  expect([...migration.matchAll(/"B": "/g)]).toHaveLength(100)
  expect([...migration.matchAll(/"C": "/g)]).toHaveLength(100)
  // the key rides the separate answer_key literal; items never carry an answer.
  expect(migration.includes('"answer":')).toBe(false)
  expect(migration.includes('"chapter_key":')).toBe(true)
  expect(migration.includes('"objective_key":')).toBe(true)
})

test('Blueprint: every chapter is represented with 5-6 items and no grouped blocks', () => {
  const counts = new Map<string, number>()
  for (const chapter of chapterSequence) counts.set(chapter, (counts.get(chapter) ?? 0) + 1)
  expect([...counts.keys()].sort()).toEqual(CHAPTERS)
  for (const chapter of CHAPTERS) {
    const count = counts.get(chapter) ?? 0
    expect(count, `${chapter} item count`).toBeGreaterThanOrEqual(5)
    expect(count, `${chapter} item count`).toBeLessThanOrEqual(6)
  }
  for (let i = 1; i < chapterSequence.length; i += 1) {
    expect(chapterSequence[i], `items ${i} and ${i + 1} share a chapter`).not.toBe(
      chapterSequence[i - 1],
    )
  }
})

test('Blueprint: each item maps to one chapter objective, with no duplicate pair', () => {
  const pairs = [...migration.matchAll(
    /"chapter_key": "(chapter-\d{2})",\s*"objective_key": "([a-z_]+)"/g,
  )].map((match) => `${match[1]}/${match[2]}`)
  expect(pairs).toHaveLength(50)
  expect(new Set(pairs).size).toBe(50)
})

test('Key non-disclosure: client SELECT on answer_key is revoked, items stays readable', () => {
  expect(migration.includes(
    'revoke select on public.ppg_pretest_instruments from anon, authenticated',
  )).toBe(true)
  expect(migration.includes(
    'grant select (version, items) on public.ppg_pretest_instruments to authenticated',
  )).toBe(true)
  // the grant never mentions the key column.
  const grant = migration.match(/grant select \([^)]*\) on public\.ppg_pretest_instruments/)
  expect(grant?.[0]).not.toContain('answer_key')
})

test('Legacy instrument: the seed is a new row, never a mutation of 2026.09.1', () => {
  expect(migration.includes("'2026.09.1'")).toBe(false)
  expect(migration.includes('delete from public.ppg_pretest_instruments')).toBe(false)
  expect(migration.includes('truncate')).toBe(false)
})

test('Screen: the items read follows the version the starter records', () => {
  expect(lib.includes(".order('version', { ascending: false })")).toBe(true)
})
