import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #15 static guards (pure source inspection — runs in CI without any
 * Supabase/Postgres credentials): the Final Project is seeded as the 11th
 * Mission (the order CHECK widened), the review's approval branch grants the
 * +300 once (`final_project` ledger event) + the three close badges (the
 * Level 5 badge guarded by the ledger's real 400 XP sum) + the module-11
 * completion the unlock functions read; the Post-Test + Survey mirror the #8
 * engine (single-attempt PK, immutable triggers, gated INSERT policies,
 * version + language CHECKs) and their unlock functions are the sequencing
 * authority (module-11 complete / the Post-Test's own submitted stamp); the
 * instrument sections grant NOTHING (no ledger/badge write anywhere near
 * them — ADR-0001); the two libs are server-only and speak the RPCs; the
 * routes + pages + routing + middleware + messages carry the new screens;
 * the practical shape widened to module-11 so the real upload + teacher
 * review queue reach the Final Project.
 */
const base = process.cwd()

const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

const migration = read('supabase/migrations/20260926001200_final_project_posttest_survey.sql')

test('the spine widens: module-11 seeded, the order CHECK reaches 11, the practical range reaches module-11', () => {
  expect(migration.includes('add constraint ppg_module_order_check check (order_index between 1 and 11)')).toBe(true)
  expect(migration.includes("check (module_key ~ '^(module-08|module-09|module-10|module-11)$')")).toBe(true)
  expect(migration.includes("('module-11', 'powerpoint-creation', 11, 'Final Project'")).toBe(true)
  expect(migration.includes('insert into public.ppg_practical_missions')).toBe(true)
})

test('the close badges are seeded with award_event final_project', () => {
  expect(migration.includes("('final_boss',")).toBe(true)
  expect(migration.includes("('level_5',")).toBe(true)
  expect(migration.includes("('course_complete',")).toBe(true)
  expect(migration.includes("'final_project'")).toBe(true)
})

test('the approval branch: +300 once, the badges once, Level 5 guarded by the ledger sum, the completion UPSERTed', () => {
  expect(migration.includes("create or replace function public.ppg_submit_review(")).toBe(true)
  expect(migration.includes("p_mission_id = 'module-11'")).toBe(true)
  expect(migration.includes("x.event_type = 'final_project'")).toBe(true)
  expect(migration.includes("'final_project', 'module-11', 300")).toBe(true)
  // the once-authorities: the existence guards + the ledger/award PKs.
  expect(migration.includes('if not exists (')).toBe(true)
  // the REAL level: the ledger sum >= 400 guards the Level 5 badge.
  expect(migration.includes('v_total_xp >= 400')).toBe(true)
  // the completion the linear rule + the Post-Test unlock read.
  expect(migration.includes('insert into public.ppg_module_missions (module_key, learner_id, status)')).toBe(true)
  expect(migration.includes("on conflict (module_key, learner_id) do update set status = 'complete'")).toBe(true)
})

test('the unlock functions: Post-Test on module-11 complete, Survey on the Post-Test submitted stamp', () => {
  expect(migration.includes('create or replace function public.ppg_posttest_unlocked(p_learner uuid)')).toBe(true)
  expect(migration.includes("and mi.module_key = 'module-11'")).toBe(true)
  expect(migration.includes("and mi.status = 'complete'")).toBe(true)
  expect(migration.includes('create or replace function public.ppg_survey_unlocked(p_learner uuid)')).toBe(true)
  expect(migration.includes('ppg_posttest_responses r')).toBe(true)
  expect(migration.includes('and r.submitted_at IS NOT NULL')).toBe(true)
})

test('the instruments: single-attempt PKs, version FKs, language CHECKs, gated INSERTs, immutable triggers', () => {
  for (const kind of ['posttest', 'survey'] as const) {
    expect(migration.includes(`create table public.ppg_${kind}_instruments`)).toBe(true)
    expect(migration.includes(`create table public.ppg_${kind}_responses`)).toBe(true)
    expect(migration.includes(`${kind}_responses (`)).toBe(true)
    expect(migration.includes(`learner_id uuid primary key references auth.users (id) on delete cascade`)).toBe(true)
    expect(migration.includes(`references public.ppg_${kind}_instruments (version) on delete restrict`)).toBe(true)
    expect(migration.includes(`constraint ppg_${kind}_language_check check (language in ('th', 'en'))`)).toBe(true)
    // the row INSERT is unlock-gated server-side (early access denied at the policy).
    expect(migration.includes(`create policy ppg_${kind}_responses_insert on public.ppg_${kind}_responses`)).toBe(true)
    expect(migration.includes(`create trigger ppg_${kind}_immutable`)).toBe(true)
    expect(migration.includes('before update on public.ppg_' + kind + '_responses')).toBe(true)
    expect(migration.includes(`grant execute on function public.ppg_${kind}_start(text)`)).toBe(true)
  }
  // the submit RPCs carry the sequencing gates' own error words.
  expect(migration.includes('final_project_not_accepted')).toBe(true)
  expect(migration.includes('posttest_not_submitted')).toBe(true)
})

test('research grants nothing (ADR-0001): NO ledger/badge write anywhere in the instrument sections', () => {
  // the instrument section is everything from the unlock functions onward —
  // after the review function (the only writer of the +300 + the badges).
  const instruments = migration.slice(migration.indexOf('4. The unlock functions'))
  expect(instruments.includes('ppg_xp_ledger')).toBe(false)
  expect(instruments.includes('ppg_badge_awards')).toBe(false)
})

test('libs: the Post-Test/Survey modules are server-only and speak the gated RPCs', () => {
  for (const [file, rpcs] of [
    ['lib/sup/posttest.ts', ['ppg_posttest_unlocked', 'ppg_posttest_start', 'ppg_posttest_upsert', 'ppg_posttest_submit']],
    ['lib/sup/survey.ts', ['ppg_survey_unlocked', 'ppg_survey_start', 'ppg_survey_upsert', 'ppg_survey_submit']],
  ] as const) {
    const lib = read(file)
    expect(lib.includes("import 'server-only'")).toBe(true)
    for (const rpc of rpcs) expect(lib.includes(rpc)).toBe(true)
  }
})

test('routes: the four API routes post the RPCs force-dynamic', () => {
  for (const [file, fn] of [
    ['app/api/posttest/autosave/route.ts', 'upsertPosttestAutosaveViaRpc'],
    ['app/api/posttest/submit/route.ts', 'submitPosttestViaRpc'],
    ['app/api/survey/autosave/route.ts', 'upsertSurveyAutosaveViaRpc'],
    ['app/api/survey/submit/route.ts', 'submitSurveyViaRpc'],
  ] as const) {
    const route = read(file)
    expect(route.includes(fn)).toBe(true)
    expect(route.includes("export const dynamic = 'force-dynamic'")).toBe(true)
  }
})

test('pages: the Post-Test/Survey screens read the unlock via the server-only libs', () => {
  const posttest = read('app/[locale]/post-test/page.tsx')
  expect(posttest.includes('readPosttestState')).toBe(true)
  expect(posttest.includes('force-dynamic')).toBe(true)
  const survey = read('app/[locale]/survey/page.tsx')
  expect(survey.includes('readSurveyState')).toBe(true)
  expect(survey.includes('force-dynamic')).toBe(true)
  // the dashboard carries the close chain's next action.
  const home = read('app/[locale]/page.tsx')
  expect(home.includes('readPosttestState')).toBe(true)
  expect(home.includes('readSurveyState')).toBe(true)
})

test('routing + middleware: the new screens are routed and session-protected', () => {
  const routing = read('lib/i18n/routing.ts')
  expect(routing.includes("'/post-test': '/post-test'")).toBe(true)
  expect(routing.includes("'/survey': '/survey'")).toBe(true)
  const mw = read('middleware.ts')
  expect(mw.includes("'/post-test'")).toBe(true)
  expect(mw.includes("'/survey'")).toBe(true)
})

test('i18n: the new namespaces exist in BOTH message files', () => {
  for (const file of ['messages/en.json', 'messages/th.json']) {
    const messages = read(file)
    expect(messages.includes('"posttest":')).toBe(true)
    expect(messages.includes('"survey":')).toBe(true)
    expect(messages.includes('"closeLabel"')).toBe(true)
  }
})

test('the Final Project rides the practical machinery: the shape widened + the teacher queue reaches module-11', () => {
  const submissions = read('lib/sup/submissions.ts')
  expect(submissions.includes('module-(08|09|10|11)$')).toBe(true)
  const reviews = read('lib/sup/reviews.ts')
  expect(reviews.includes('practical shape (module-08|09|10|11)')).toBe(true)
  const queue = read('app/[locale]/teacher/review/page.tsx')
  expect(queue.includes("readReviewQueueViaRpc('module-11')")).toBe(true)
})
