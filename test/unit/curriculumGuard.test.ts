import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #9 static guards (pure source inspection — runs in CI without any
 * Supabase/Postgres credentials): the Skill Domains + the ONE Course + the
 * ordered Modules + the bilingual Lessons are seeded by migration
 * 20260926000600 with the publication states CHECKed default draft and the
 * learner SELECT denied by the gate + the published state + the unlock rule
 * (RLS, never a hidden UI); the linear rule the function computes module 1
 * open / the rest locked off the `ppg_module_missions` placeholder seeded
 * `incomplete`; the map/lesson RPCs return every SEE-ABLE row + the real
 * lock state, and the publication toggle RPC is admin-only with one UPDATE
 * + one audit INSERT; the curriculum lib is server-only and calls the RPCs
 * with the request's user JWT; the course/admin-publication pages and the
 * toggle route call the lib; the middleware protects `/course` and redirects
 * an ungated learner away from it; the i18n routing has the pathname
 * templates; and both message files carry the `course`, `lesson`,
 * `publication` copy.
 */
const base = process.cwd()

const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

test('migration: domains + ONE course + modules/lessons with the CHECKed publication state', () => {
  const m = read('supabase/migrations/20260926000600_curriculum_locks_publication.sql')
  expect(m.includes('create table public.ppg_skill_domains')).toBe(true)
  expect(m.includes('create table public.ppg_courses')).toBe(true)
  expect(m.includes('create table public.ppg_modules')).toBe(true)
  expect(m.includes('create table public.ppg_lessons')).toBe(true)
  expect(m.includes("publication_state text not null default 'draft'")).toBe(true)
  expect(m.includes("check (publication_state in ('draft', 'published', 'archived'))")).toBe(true)
  expect(m.includes('what_learn_th text not null')).toBe(true)
  expect(m.includes('what_next_en text not null')).toBe(true)
  expect(m.includes('skill_domain text not null references public.ppg_skill_domains')).toBe(true)
  expect(m.includes('create table public.ppg_module_missions')).toBe(true)
  expect(m.includes("check (status in ('incomplete', 'complete'))")).toBe(true)
})

test('RLS: a gated learner reads ONLY published + unlocked modules (never draft/arched, never a hidden UI)', () => {
  const m = read('supabase/migrations/20260926000600_curriculum_locks_publication.sql')
  expect(m.includes('alter table public.ppg_modules enable row level security')).toBe(true)
  expect(m.includes('create policy ppg_modules_select on public.ppg_modules')).toBe(true)
  expect(m.includes("auth.role() = 'learner'")).toBe(true)
  expect(m.includes('public.ppg_learner_gated(auth.uid())')).toBe(true)
  expect(m.includes("AND publication_state = 'published'")).toBe(true)
  expect(m.includes('AND public.ppg_module_unlocked(auth.uid(), module_key)')).toBe(true)
  expect(m.includes('create policy ppg_lessons_select on public.ppg_lessons')).toBe(true)
  expect(m.includes('create policy ppg_modules_update on public.ppg_modules')).toBe(true)
  expect(m.includes("using auth.role() = 'admin'")).toBe(true)
})

test('Rule: module 1 opens on the gate alone; module N+1 iff module N is complete (the placeholder)', () => {
  const m = read('supabase/migrations/20260926000600_curriculum_locks_publication.sql')
  expect(m.includes('create or replace function public.ppg_module_unlocked')).toBe(true)
  expect(m.includes('if v_order = 1 then')).toBe(true)
  expect(m.includes('return true')).toBe(true)
  expect(m.includes("AND mi.status = 'complete'")).toBe(true)
  expect(m.includes('v_order - 1')).toBe(true)
  expect(m.includes('security definer')).toBe(true)
})

test('Map + detail: the RPCs return every SEE-ABLE row + the real lock state', () => {
  const m = read('supabase/migrations/20260926000600_curriculum_locks_publication.sql')
  expect(m.includes('create or replace function public.ppg_course_map')).toBe(true)
  expect(m.includes("CASE WHEN public.ppg_module_unlocked(auth.uid(), m.module_key) THEN 'open' ELSE 'locked' END")).toBe(true)
  expect(m.includes('create or replace function public.ppg_module_lessons')).toBe(true)
  expect(m.includes('coalesce')).toBe(true)
  expect(m.includes("'[]'::jsonb")).toBe(true)
})

test('Toggle: the publication RPC is admin-only, one UPDATE + one audit INSERT', () => {
  const m = read('supabase/migrations/20260926000600_curriculum_locks_publication.sql')
  expect(m.includes('create or replace function public.ppg_set_publication')).toBe(true)
  expect(m.includes("auth.role() != 'admin'")).toBe(true)
  expect(m.includes('permission_denied: ppg_set_publication is admin-only')).toBe(true)
  expect(m.includes('invalid_publication_state: p_new_state must be one of draft|published|archived')).toBe(true)
  expect(m.includes('target_missing: no module/lesson row for p_target_key')).toBe(true)
  expect(m.includes('insert into public.ppg_audit_events')).toBe(true)
  expect(m.includes("'publication'")).toBe(true)
})

test('Lib: the curriculum module is server-only and calls the map/lesson/toggle RPCs', () => {
  const lib = read('lib/sup/curriculum.ts')
  expect(lib.includes("import 'server-only'")).toBe(true)
  expect(lib.includes('readCourseMapViaRpc')).toBe(true)
  expect(lib.includes('readLessonsViaRpc')).toBe(true)
  expect(lib.includes('togglePublicationViaRpc')).toBe(true)
  expect(lib.includes('ppg_course_map')).toBe(true)
  expect(lib.includes('ppg_module_lessons')).toBe(true)
  expect(lib.includes('ppg_set_publication')).toBe(true)
})

test('Pages: the course map / module / lesson read via the server-only lib', () => {
  const map = read('app/[locale]/course/page.tsx')
  expect(map.includes('readCourseMapViaRpc')).toBe(true)
  expect(map.includes('force-dynamic')).toBe(true)
  const modulePage = read('app/[locale]/course/[moduleKey]/page.tsx')
  expect(modulePage.includes('readLessonsViaRpc')).toBe(true)
  expect(modulePage.includes('params.moduleKey')).toBe(true)
  const lesson = read('app/[locale]/course/[moduleKey]/[lessonKey]/page.tsx')
  expect(lesson.includes('readLessonsViaRpc')).toBe(true)
  expect(lesson.includes('whatHeading')).toBe(true)
  expect(lesson.includes('whyHeading')).toBe(true)
  expect(lesson.includes('nextHeading')).toBe(true)
  const admin = read('app/[locale]/admin/publication/page.tsx')
  expect(admin.includes('action="/api/curriculum/publication"')).toBe(true)
  const route = read('app/api/curriculum/publication/route.ts')
  expect(route.includes('togglePublicationViaRpc')).toBe(true)
  expect(route.includes("import 'server-only'")).toBe(false) // routes are API, the lib is server-only
})

test('Middleware + routing: /course is protected and the gate redirects an ungated learner', () => {
  const mw = read('middleware.ts')
  expect(mw.includes("'/course'")).toBe(true)
  expect(mw.includes("'/admin/publication'")).toBe(true)
  expect(mw.includes('pathname.startsWith(`/')).toBe(true)
  const routing = read('lib/i18n/routing.ts')
  expect(routing.includes("'/course': '/course")).toBe(true)
  expect(routing.includes("'/course/[moduleKey]'")).toBe(true)
  expect(routing.includes("'/course/[moduleKey]/[lessonKey]'")).toBe(true)
  expect(routing.includes("'/admin/publication'")).toBe(true)
})

test('i18n: both message files carry the course/lesson/publication copy', () => {
  const th = read('messages/th.json')
  const en = read('messages/en.json')
  for (const f of [th, en]) {
    expect(f.includes('"course":')).toBe(true)
    expect(f.includes('"lesson":')).toBe(true)
    expect(f.includes('"publication":')).toBe(true)
    expect(f.includes('"linkCourse":')).toBe(true)
  }
})
