import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #74 static guards (no DB needed): the migration's server-side key
 * discipline (RLS on with no client SELECT policy; the read RPCs never
 * project `is_correct`), the single-attempt pre index, the best-score 70%
 * gate and the pre-test rejection word; the curriculum lib's key schema
 * accepts the new chapter shape; the page/route wiring uses the server-only
 * module.
 */
const base = process.cwd()
const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

const migration =
  'supabase/migrations/20261116000100_chapter_pre_post_tests.sql'

test('Bank: RLS is enabled and NO select policy grants the answer-key table', () => {
  const m = read(migration)
  expect(m.includes('create table public.ppg_chapter_test_questions')).toBe(true)
  expect(m.includes('alter table public.ppg_chapter_test_questions enable row level security')).toBe(true)
  // only the two attempt/unlock SELECT policies exist; the bank has none.
  expect(m.includes('create policy ppg_chapter_test_attempts_select')).toBe(true)
  expect(m.includes('create policy ppg_chapter_unlocks_select')).toBe(true)
  expect(m.includes('on public.ppg_chapter_test_questions\n  for select')).toBe(false)
})

test('Read RPC: the bank projection never selects is_correct', () => {
  const m = read(migration)
  const bankStart = m.indexOf('create or replace function public.ppg_chapter_test_bank(')
  const bankEnd = m.indexOf('create or replace function public.ppg_chapter_test_feedback(')
  const bank = m.slice(bankStart, bankEnd)
  expect(bank.length).toBeGreaterThan(0)
  expect(bank.includes('is_correct')).toBe(false)
  // the state RPC builds from the bank helper, not the table's key column
  const stateStart = m.indexOf('create or replace function public.ppg_chapter_test_state(')
  const stateEnd = m.indexOf('create or replace function public.ppg_chapter_test_submit(')
  const state = m.slice(stateStart, stateEnd)
  expect(state.includes('is_correct')).toBe(false)
})

test('Rules: one pre attempt (partial unique index), best-score 70% gate, research first score', () => {
  const m = read(migration)
  expect(m.includes('create unique index ppg_chapter_test_single_pre_attempt')).toBe(true)
  expect(m.includes('where phase = \'pre\'')).toBe(true)
  expect(m.includes('v_passed := (v_best * 100) >= (70 * v_total)')).toBe(true)
  expect(m.includes('pre_already_submitted')).toBe(true)
  expect(m.includes('order by attempt_seq asc limit 1')).toBe(true)
  expect(m.includes('insert into public.ppg_chapter_unlocks')).toBe(true)
})

test('Bank constraints: phase/form/option checks + the deferred bank guard', () => {
  const m = read(migration)
  expect(m.includes("check (phase in ('pre', 'post'))")).toBe(true)
  expect(m.includes("check (form in ('a', 'b'))")).toBe(true)
  expect(m.includes("check (option_key in ('a', 'b', 'c'))")).toBe(true)
  expect(m.includes('create constraint trigger ppg_chapter_test_bank_guard')).toBe(true)
  expect(m.includes('deferrable initially deferred')).toBe(true)
  expect(m.includes('malformed_bank')).toBe(true)
})

test('Curriculum key schema accepts chapter-NN and remains anchored', () => {
  const lib = read('lib/sup/curriculum.ts')
  expect(lib.includes('chapter-\\d{2}')).toBe(true)
  expect(lib.includes('/^(module-\\d{2}|chapter-\\d{2}|(?:module|chapter)-\\d{2}-lesson-\\d{2})$/i')).toBe(true)
})

test('Page + route: the chapter test screen reads via the server-only module and posts to the submit route', () => {
  const page = read('app/[locale]/course/[moduleKey]/chapter-test/[phase]/page.tsx')
  expect(page.includes('readChapterTestStateViaRpc')).toBe(true)
  expect(page.includes('action="/api/chapter-test/submit"')).toBe(true)
  expect(page.includes('force-dynamic')).toBe(true)
  // The form names its radios `item_<order_index>`; the submit RPC reads the
  // answers by the bare `order_index` key. A silent mismatch scores every item
  // wrong, so pin both halves of the contract here.
  expect(page.includes('name={`item_${q.order_index}`}')).toBe(true)
  const route = read('app/api/chapter-test/submit/route.ts')
  expect(route.includes('submitChapterTestViaRpc')).toBe(true)
  expect(route.includes('rejectCrossOrigin')).toBe(true)
  expect(route.includes("k.replace(/^item_/, '')")).toBe(true)
  const lib = read('lib/sup/chapterTest.ts')
  expect(lib.includes("import 'server-only'")).toBe(true)
  expect(lib.includes('ppg_chapter_test_state')).toBe(true)
  expect(lib.includes('ppg_chapter_test_submit')).toBe(true)
})
