import { test, expect } from 'vitest'
import { readFileSync } from 'node:fs'

/**
 * Ticket #16 static guards (pure source inspection — runs in CI without any
 * Supabase/Postgres credentials): the export RPC gates the JWT role claim
 * teacher/admin-only and refuses formats beyond csv|xlsx|sql (the PDF is
 * #17), writing exactly one audit INSERT per call; the routes call the RPCs
 * with Zod-validated inputs and never touch the service-role key; the page
 * reads via the lib; the middleware guards the new pathname; and the
 * `admin.export.*` copy exists in BOTH locales with the same key set
 * (the next-intl bilingual rule).
 */
const base = process.cwd()

const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

test('export migration: teacher/admin gate, format gate, audit INSERT on the same call', () => {
  const migration = read('supabase/migrations/20260930000000_research_export.sql')
  expect(migration.includes('create or replace function public.ppg_research_export(')).toBe(true)
  expect(migration.includes('create or replace function public.ppg_research_export_preview(')).toBe(true)
  // the gate: JWT role claim, teacher/admin only, hard raise (no slip past a NULL claim)
  expect(migration.includes("if coalesce(auth.role(), '') not in ('teacher', 'admin') then")).toBe(true)
  expect(migration.includes("raise exception 'permission_denied")).toBe(true)
  // the format gate: csv | xlsx | sql ONLY — the PDF is #17, never this RPC
  expect(migration.includes("p_format not in ('csv', 'xlsx', 'sql')")).toBe(true)
  expect(migration.includes('export_format_denied')).toBe(true)
  // one audit event per export call (append-only table, ADR-0002)
  expect(migration.includes('insert into public.ppg_audit_events')).toBe(true)
  expect(migration.includes("'research_export'")).toBe(true)
  // the preview NEVER audits (a page view is not an export run)
  const previewBody = migration.slice(migration.indexOf('ppg_research_export_preview()'))
  expect(previewBody.includes('insert into public.ppg_audit_events')).toBe(false)
  // grants: revoked from the client-facing Postgres roles, kept for authenticated/service_role
  expect(migration.includes('revoke execute on function public.ppg_research_export(text)')).toBe(true)
  expect(migration.includes('revoke execute on function public.ppg_research_export_preview()')).toBe(true)
  expect(migration.includes('to authenticated, service_role')).toBe(true)
})

test('export lib + routes: session-JWT clients, Zod guards, no service-role key', () => {
  const lib = read('lib/sup/export.ts')
  expect(lib.includes("import 'server-only'")).toBe(true)
  expect(lib.includes('ppg_research_export')).toBe(true)
  expect(lib.includes('ppg_research_export_preview')).toBe(true)
  expect(lib.includes('cookies')).toBe(true)
  expect(lib.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)

  const research = read('app/api/export/research/route.ts')
  expect(research.includes('exportQuerySchema')).toBe(true)
  expect(research.includes('safeParse')).toBe(true)
  expect(research.includes('runExportViaRpc')).toBe(true)
  expect(research.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)

  const preview = read('app/api/export/preview/route.ts')
  expect(preview.includes('previewExportViaRpc')).toBe(true)
  expect(preview.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)
})

test('export page + middleware: the page reads via the lib, the pathname is guarded', () => {
  const page = read('app/[locale]/admin/export/page.tsx')
  expect(page.includes('previewExportViaRpc')).toBe(true)
  expect(page.includes('/api/export/research?format=csv')).toBe(true)
  expect(page.includes('/api/export/research?format=xlsx')).toBe(true)
  expect(page.includes('/api/export/research?format=sql')).toBe(true)
  expect(page.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)

  const mw = read('middleware.ts')
  expect(mw.includes("'/admin/export'")).toBe(true)
})

test('bilingual: admin.export.* carries the SAME keys in en and th (no locale-only copy)', () => {
  type Messages = { admin: { export: Record<string, string> } }
  const en = JSON.parse(read('messages/en.json')) as Messages
  const th = JSON.parse(read('messages/th.json')) as Messages
  const enExport = en.admin.export
  const thExport = th.admin.export
  const enKeys = Object.keys(enExport).sort()
  const thKeys = Object.keys(thExport).sort()
  expect(thKeys).toEqual(enKeys)
  // every copy is filled in both locales (no empty string smuggles a fallback)
  for (const k of enKeys) {
    expect(String(enExport[k]).trim().length).toBeGreaterThan(0)
    expect(String(thExport[k]).trim().length).toBeGreaterThan(0)
  }
})
