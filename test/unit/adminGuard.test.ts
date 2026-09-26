import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #6 static guards (pure source inspection — runs in CI without any
 * Supabase/Postgres credentials): the audit foundation is a migration's
 * table + policies (append-only denies UPDATE/DELETE, admin reads, every
 * authenticated role inserts); the role-change RPC + the admin list/audit
 * RPCs gate the JWT's role claim; the routes call the RPCs with Zod-validated
 * bodies and stay server-only (`import 'server-only'`); the lib module carries
 * the RPC names; and the console's pages read via the lib (never the
 * service-role key).
 */
const base = process.cwd()

const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

test('audit foundation: the migration creates the table + the admin-only read policy', () => {
  const migration = read('supabase/migrations/20260925000300_audit_events.sql')
  expect(migration.includes('create table public.ppg_audit_events')).toBe(true)
  expect(migration.includes('alter table public.ppg_audit_events enable row level security')).toBe(true)
  expect(migration.includes('create policy ppg_audit_events_select on public.ppg_audit_events')).toBe(true)
  expect(migration.includes('using auth.role()')).toBe(true)
  // append-only: no UPDATE/DELETE policy is granted (the comment says so);
  // the migration must never grant one.
  expect(migration.includes('for update')).toBe(false)
  expect(migration.includes('for delete')).toBe(false)
  expect(migration.includes('create policy ppg_audit_events_insert on public.ppg_audit_events')).toBe(true)
})

test('role-change RPC + admin list/audit RPCs gate the JWT role claim admin-only', () => {
  const migration = read('supabase/migrations/20260925000300_audit_events.sql')
  expect(migration.includes('create or replace function public.ppg_change_role')).toBe(true)
  expect(migration.includes("if auth.role() != 'admin' then")).toBe(true)
  expect(migration.includes('raise exception')).toBe(true)
  expect(migration.includes('insert into public.ppg_audit_events')).toBe(true)
  expect(migration.includes('create or replace function public.ppg_admin_users_list')).toBe(true)
  expect(migration.includes('create or replace function public.ppg_admin_audit_list')).toBe(true)
  expect(migration.includes('revoke execute on function public.ppg_change_role')).toBe(true)
})

test('admin API routes call the RPCs with Zod guards and stay server-only', () => {
  const users = read('app/api/admin/users/route.ts')
  expect(users.includes('listUsersViaRpc')).toBe(true)
  expect(users.includes('usersPageSchema')).toBe(true)
  expect(users.includes('safeParse')).toBe(true)

  const role = read('app/api/admin/role/route.ts')
  expect(role.includes('changeRoleViaRpc')).toBe(true)
  expect(role.includes('roleChangeFormSchema')).toBe(true)
  expect(role.includes('FormData')).toBe(true)

  const audit = read('app/api/admin/audit/route.ts')
  expect(audit.includes('readAuditViaTable')).toBe(true)
})

test('admin lib module is server-only and carries the RPC names', () => {
  const admin = read('lib/sup/admin.ts')
  expect(admin.includes("import 'server-only'")).toBe(true)
  expect(admin.includes('cookies')).toBe(true)
  expect(admin.includes('ppg_admin_users_list')).toBe(true)
  expect(admin.includes('ppg_change_role')).toBe(true)
  expect(admin.includes('ppg_admin_audit_list')).toBe(true)
  expect(admin.includes('ppg_roleSchema')).toBe(true)
  expect(admin.includes('uuidSchema')).toBe(true)
})

test('admin console pages read via the lib (never the service-role key)', () => {
  const users = read('app/[locale]/admin/users/page.tsx')
  expect(users.includes('listUsersViaRpc')).toBe(true)
  expect(users.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)

  const audit = read('app/[locale]/admin/audit/page.tsx')
  expect(audit.includes('readAuditViaTable')).toBe(true)
  expect(audit.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)
})

test('middleware guards admin paths with the unauthorized redirect', () => {
  const mw = read('middleware.ts')
  expect(mw.includes('/admin/users')).toBe(true)
  expect(mw.includes('/admin/audit')).toBe(true)
  expect(mw.includes('protectedRoutes')).toBe(true)
  expect(mw.includes('login')).toBe(true)
})

test('messages carry the admin console copy in both locales', () => {
  const th = read('messages/th.json')
  const en = read('messages/en.json')
  expect(th.includes('adminUsers')).toBe(true)
  expect(th.includes('adminAudit')).toBe(true)
  expect(th.includes('changeRole')).toBe(true)
  expect(en.includes('adminUsers')).toBe(true)
  expect(en.includes('adminAudit')).toBe(true)
  expect(en.includes('changeRole')).toBe(true)
})
