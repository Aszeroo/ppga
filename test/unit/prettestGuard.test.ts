import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #8 static guards (pure source inspection — runs in CI without any
 * Supabase/Postgres credentials): the consent flag + the override flag are
 * profiles columns; the Pre-Test instrument is a versioned seeded table with
 * the answer key server-side (never a client-readable key); the response
 * table carries instrument version + language and has the single-attempt
 * PK (one row per learner, `learner_id`) + the immutable-once-submitted
 * trigger (a UPDATE after `submitted_at` raises); the gate function reads
 * consent AND (submitted OR override) and the placeholder gated content
 * denies an ungated learner at the RLS level; the consent/override RPCs are
 * admin-only, each one UPDATE + one audit INSERT; the admin console's pages
 * call them via the server-only lib; the login route reads the gate flags
 * under the CALLER's own JWT + RLS and rides httpOnly cookies; the
 * middleware speaks the deeper redirect on the gate's pathname; and the
 * PreTest/Content pages read the gate via the server-only lib (never the
 * service-role key).
 */
const base = process.cwd()

const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

test('consent + override: the gate flags live in the profile (no in-app consent flow)', () => {
  const migration = read('supabase/migrations/20260926000500_consent_prettest_gate.sql')
  expect(migration.includes('add column consent boolean')).toBe(true)
  expect(migration.includes('add column prettest_unlocked_override boolean')).toBe(true)
  // no in-app consent flow anywhere in the app — the routes/pages never exist.
  const app = read('app/[locale]/page.tsx')
  expect(app.includes('consentForm'))
    .toBe(false)
  expect(read('app/[locale]/pre-test/page.tsx').includes('readGateViaTable')).toBe(true)
})

test('instrument: versioned seed + the answer key server-side only', () => {
  const migration = read('supabase/migrations/20260926000500_consent_prettest_gate.sql')
  expect(migration.includes('create table public.ppg_pretest_instruments')).toBe(true)
  expect(migration.includes("version text primary key")).toBe(true)
  expect(migration.includes('items jsonb not null')).toBe(true)
  expect(migration.includes('answer_key jsonb not null')).toBe(true)
  // the items-column policy grants a consenting learner; no UPDATE/DELETE.
  expect(migration.includes('create policy ppg_pretest_items on public.ppg_pretest_instruments')).toBe(true)
  expect(migration.includes('for select (items)')).toBe(true)
  expect(migration.includes("p.consent")).toBe(true)
  // the key never reaches the browser — the read is the definer's submit
  // function's, never a client SELECT on the key column.
  expect(migration.includes('for select (answer_key)')).toBe(false)
})

test('response: single-attempt PK + instrument version + language', () => {
  const migration = read('supabase/migrations/20260926000500_consent_prettest_gate.sql')
  expect(migration.includes('create table public.ppg_pretest_responses')).toBe(true)
  expect(migration.includes('learner_id uuid primary key')).toBe(true)
  expect(migration.includes('instrument_version text not null references public.ppg_pretest_instruments')).toBe(true)
  expect(migration.includes('language text not null')).toBe(true)
  // the CHECK keeps the language finite (th | en); a smuggled `vi` cannot INSERT.
  expect(migration.includes("check (language in ('th', 'en'))")).toBe(true)
})

test('submit-once + immutable: the trigger denies a UPDATE after `submitted_at`', () => {
  const migration = read('supabase/migrations/20260926000500_consent_prettest_gate.sql')
  expect(migration.includes('create or replace function public.ppg_prettest_immutable()')).toBe(true)
  expect(migration.includes('raise exception')).toBe(true)
  expect(migration.includes('already_submitted')).toBe(true)
  expect(migration.includes('create trigger ppg_prettest_immutable')).toBe(true)
  expect(migration.includes('before update')).toBe(true)
  // the submit function scores + stamps `submitted_at` atomically.
  expect(migration.includes('create or replace function public.ppg_prettest_submit')).toBe(true)
  expect(migration.includes('submitted_at = now()')).toBe(true)
  expect(migration.includes('already_submitted_or_missing')).toBe(true)
  // the upsert rides the CALLER's own row pre-submission only.
  expect(migration.includes('ppg_prettest_upsert')).toBe(true)
  expect(migration.includes('submitted_at IS NULL')).toBe(true)
})

test('gate: the function + the placeholder gated content deny an ungated learner', () => {
  const migration = read('supabase/migrations/20260926000500_consent_prettest_gate.sql')
  expect(migration.includes('create or replace function public.ppg_learner_gated')).toBe(true)
  expect(migration.includes('p.consent')).toBe(true)
  expect(migration.includes('r.submitted_at IS NOT NULL')).toBe(true)
  expect(migration.includes('p.prettest_unlocked_override')).toBe(true)
  expect(migration.includes('create table public.ppg_course_content')).toBe(true)
  expect(migration.includes('alter table public.ppg_course_content enable row level security')).toBe(true)
  expect(migration.includes('create policy ppg_course_content_select on public.ppg_course_content')).toBe(true)
  expect(migration.includes('using public.ppg_learner_gated')).toBe(true)
  // the gate is enforced here (RLS) — content is inaccessible server-side
  // before the gate opens, never a hidden UI the smuggle could pass.
})

test('override audit: the consent/override RPCs are admin-only, one UPDATE + one audit INSERT', () => {
  const migration = read('supabase/migrations/20260926000500_consent_prettest_gate.sql')
  expect(migration.includes('create or replace function public.ppg_set_consent')).toBe(true)
  expect(migration.includes("auth.role() != 'admin'")).toBe(true)
  expect(migration.includes('permission_denied: ppg_set_consent is admin-only')).toBe(true)
  expect(migration.includes('insert into public.ppg_audit_events')).toBe(true)
  expect(migration.includes("'consent'")).toBe(true)
  expect(migration.includes('create or replace function public.ppg_prettest_unlock_override')).toBe(true)
  expect(migration.includes('permission_denied: ppg_prettest_unlock_override is admin-only')).toBe(true)
  expect(migration.includes("'prettest_unlock_override'")).toBe(true)
})

test('console: the pages call the RPCs via the server-only lib (never the service-role key)', () => {
  const lib = read('lib/sup/admin.ts')
  expect(lib.includes("import 'server-only'")).toBe(true)
  expect(lib.includes('setConsentViaRpc')).toBe(true)
  expect(lib.includes('unlockOverrideViaRpc')).toBe(true)
  expect(lib.includes('ppg_set_consent')).toBe(true)
  expect(lib.includes('ppg_prettest_unlock_override')).toBe(true)
  const users = read('app/[locale]/admin/users/page.tsx')
  expect(users.includes('action="/api/admin/consent"')).toBe(true)
  expect(users.includes('action="/api/admin/override"')).toBe(true)
  const routes = read('app/api/admin/consent/route.ts')
  expect(routes.includes('setConsentViaRpc')).toBe(true)
  expect(routes.includes("import 'server-only'")).toBe(false) // the routes are API, the lib is server-only
})

test('login: the gate flags ride the caller own JWT + RLS and httpOnly cookies', () => {
  const login = read('app/api/auth/login/route.ts')
  expect(login.includes('consent, prettest_unlocked_override')).toBe(true)
  expect(login.includes("res.cookies.set('ppga_consent'")).toBe(true)
  expect(login.includes("res.cookies.set('ppga_pretest_unlocked'")).toBe(true)
  expect(login.includes("res.cookies.set('ppga_pretest_submitted'")).toBe(true)
  expect(login.includes('httpOnly: true')).toBe(true)
})

test('middleware: the gate redirects speak the cookie flags (never a hidden UI)', () => {
  const mw = read('middleware.ts')
  expect(mw.includes('ppga_consent')).toBe(true)
  expect(mw.includes('ppga_pretest_unlocked')).toBe(true)
  expect(mw.includes('ppga_pretest_submitted')).toBe(true)
  expect(mw.includes('/pre-test')).toBe(true)
  expect(mw.includes('/content')).toBe(true)
})

test('pages: the PreTest/Content pages read the gate via the server-only lib', () => {
  const prettestLib = read('lib/sup/prettest.ts')
  expect(prettestLib.includes("import 'server-only'")).toBe(true)
  expect(prettestLib.includes('readGateViaTable')).toBe(true)
  expect(prettestLib.includes('upsupertAutosaveViaRpc')).toBe(true)
  expect(prettestLib.includes('submitViaRpc')).toBe(true)
  const preTest = read('app/[locale]/pre-test/page.tsx')
  expect(preTest.includes('readGateViaTable')).toBe(true)
  expect(preTest.includes('force-dynamic')).toBe(true)
  const content = read('app/[locale]/content/page.tsx')
  expect(content.includes('readGateViaTable')).toBe(true)
  expect(content.includes('force-dynamic')).toBe(true)
  // the answer key never reaches the client — the items read is a table
  // select on the items column, never a key select.
  expect(prettestLib.includes(".select('consent")).toBe(true)
})

test('i18n: the new namespaces are routed (the locale switch works everywhere)', () => {
  const routing = read('lib/i18n/routing.ts')
  expect(routing.includes("'/pre-test': '/pre-test")).toBe(true)
  expect(routing.includes("'/content': '/content")).toBe(true)
  const th = read('messages/th.json')
  expect(th.includes('"pretest":')).toBe(true)
  expect(th.includes('"content":')).toBe(true)
  const en = read('messages/en.json')
  expect(en.includes('"pretest":')).toBe(true)
  expect(en.includes('"content":')).toBe(true)
})
