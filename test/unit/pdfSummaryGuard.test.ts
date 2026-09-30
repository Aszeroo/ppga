// @vitest-environment node
// The PDF render rides the SAME Node runtime as `next start` (jsdom would
// pull pdfkit's browser path — a different zlib flavor than the server
// ships, and Buffer fails pdfkit's cross-realm `instanceof Uint8Array`
// check there; the server reality is what this guard must prove).
import { test, expect } from 'vitest'
import { readFileSync, existsSync, statSync } from 'node:fs'
import { inflateSync } from 'node:zlib'

import { renderSummaryPdf, type PdfSummaryStats } from '../../lib/pdf/summaryReport'

/**
 * Ticket #17 static guards + real-render checks (pure source inspection and
 * a dependency-only PDF render — runs in CI without any Supabase/Postgres
 * credentials): the summary RPC is teacher/admin-gated and writes exactly
 * one 'pdf_summary' audit INSERT per call; the lib/route carry the session
 * JWT and never the service-role key, and NEVER compute a statistic (no
 * avg/round lives outside the migration — the numbers are the database's);
 * the renderer embeds the vendored Mitr TTFs (the Thai-glyph decision,
 * OFL licenses shipped); the page links the PDF audited route; the
 * `admin.export.*` copy — `downloadPdf` included — exists in BOTH locales
 * with the same key set. Finally: an ACTUAL PDF is rendered from sample
 * stats and checked — %PDF header, non-trivial size, a real ToUnicode CMap
 * mapping the Thai codepoints the labels use (proving Thai glyphs are
 * embedded and the text stays extractable), and multi-page pagination.
 */
const base = process.cwd()

const read = (file: string) => readFileSync(`${base}/${file}`, 'utf8')

const sampleStats = (items = 1): PdfSummaryStats => ({
  generated_at: '2026-09-30T00:00:00.000Z',
  participant_count: 2,
  pretest: { submitted_count: 2, mean: 2.0, min: 1, max: 3 },
  posttest: { submitted_count: 1, mean: 10, min: 10, max: 10 },
  rubric: {
    review_count: 2,
    total_mean: 24.5,
    decisions: { approved: 2, needs_improvement: 0 },
    total_distribution: { '7-13': 0, '14-20': 0, '21-27': 1, '28-35': 1 },
    criteria: [
      {
        ordinal: 1,
        criterion: 'content_structure',
        label_th: 'เนื้-อ-สิด-กาน (Content Structure)',
        label_en: 'Content Structure',
        reviews: 2,
        mean: 3.5,
        counts: { '1': 0, '2': 0, '3': 1, '4': 1, '5': 0 },
      },
    ],
  },
  satisfaction: {
    submitted_count: 1,
    items: Array.from({ length: items }, (_, i) => ({
      item: `item_${i + 1}`,
      tallies: { A: 1, B: 2, C: 0 },
    })),
  },
})

/** Every stream body (deflate-compressed ones inflated) as latin1 text. */
function pdfText(bytes: Uint8Array): string {
  const buf = Buffer.from(bytes)
  const parts: string[] = [buf.toString('latin1')]
  let idx = 0
  for (;;) {
    const s = buf.indexOf('stream', idx)
    if (s === -1) break
    let start = s + 6
    if (buf[start] === 0x0d) start++
    if (buf[start] === 0x0a) start++
    const e = buf.indexOf('endstream', start)
    if (e === -1) break
    let body = buf.subarray(start, e)
    if (body.length > 0 && body[body.length - 1] === 0x0a) body = body.subarray(0, body.length - 1)
    for (const candidate of [body, body.subarray(0, Math.max(0, body.length - 1))]) {
      try {
        parts.push(inflateSync(candidate).toString('latin1'))
        break
      } catch {
        /* not a zlib stream (or trailing EOL) — try the shorter slice */
      }
    }
    idx = e + 9
  }
  return parts.join('\n')
}

test('summary migration: teacher/admin gate, one audit INSERT, grants (never a client-facing execute)', () => {
  const migration = read('supabase/migrations/20260930000100_pdf_summary_report.sql')
  expect(migration.includes('create or replace function public.ppg_pdf_summary()')).toBe(true)
  // the gate: JWT role claim, teacher/admin only, hard raise (no slip past a NULL claim)
  expect(migration.includes("if coalesce(auth.role(), '') not in ('teacher', 'admin') then")).toBe(true)
  expect(migration.includes("raise exception 'permission_denied")).toBe(true)
  // one audit event per call on the #16 append-only vocabulary
  expect(migration.includes('insert into public.ppg_audit_events')).toBe(true)
  expect(migration.includes("'pdf_summary'")).toBe(true)
  // THE statistics live HERE (round(avg,2) is the number the PDF prints)
  expect(migration.includes('round(avg(score), 2)')).toBe(true)
  expect(migration.includes("'7-13'")).toBe(true)
  // grants: revoked from the client-facing Postgres roles, kept for authenticated/service_role
  expect(migration.includes('revoke execute on function public.ppg_pdf_summary()')).toBe(true)
  expect(migration.includes('to authenticated, service_role')).toBe(true)
})

test('summary lib + route: session-JWT client, no service-role key, ZERO statistics outside the DB', () => {
  const lib = read('lib/sup/pdfSummary.ts')
  expect(lib.includes("import 'server-only'")).toBe(true)
  expect(lib.includes('ppg_pdf_summary')).toBe(true)
  expect(lib.includes('cookies')).toBe(true)
  expect(lib.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)
  // the lib only carries the rpc's jsonb — no derivation lives here
  expect(lib.includes('avg(')).toBe(false)
  expect(lib.includes('round(')).toBe(false)

  const route = read('app/api/export/pdf/route.ts')
  expect(route.includes('runPdfSummaryViaRpc')).toBe(true)
  expect(route.includes('renderSummaryPdf')).toBe(true)
  expect(route.includes('application/pdf')).toBe(true)
  expect(route.includes("export const dynamic = 'force-dynamic'")).toBe(true)
  expect(route.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)
  expect(route.includes('avg(')).toBe(false)
  expect(route.includes('Math.round')).toBe(false)
})

test('renderer: pdfkit + the vendored Mitr Thai TTFs, bilingual labels, em-dash for NULL, no DB reach', () => {
  const renderer = read('lib/pdf/summaryReport.ts')
  expect(renderer.includes('pdfkit')).toBe(true)
  expect(renderer.includes('Mitr-Regular.ttf')).toBe(true)
  expect(renderer.includes('Mitr-SemiBold.ttf')).toBe(true)
  // bilingual labels ride the document (Thai + English side by side)
  expect(renderer.includes('รายงานสรุปผลระดับกลุ่มผู้เรียน')).toBe(true)
  expect(renderer.includes('Pre-Test Results')).toBe(true)
  expect(renderer.includes('Rubric Score Distribution')).toBe(true)
  expect(renderer.includes('Satisfaction Tallies')).toBe(true)
  // the mean rides the DB's two decimals; NULL prints an em dash (never NaN)
  expect(renderer.includes('toFixed(2)')).toBe(true)
  expect(renderer.includes("'—'")).toBe(true)
  // the renderer is PURE: no cookies, no keys, no SQL
  expect(renderer.includes('next/headers')).toBe(false)
  expect(renderer.includes('SUP_SERVICE_ROLE_KEY')).toBe(false)
  expect(/select\b/i.test(renderer)).toBe(false)

  // the fonts are really vendored (Thai glyph coverage is the ticket's risk)
  for (const font of ['app/fonts/Mitr-Regular.ttf', 'app/fonts/Mitr-SemiBold.ttf']) {
    expect(existsSync(`${base}/${font}`), font).toBe(true)
    expect(statSync(`${base}/${font}`).size).toBeGreaterThan(50_000)
  }
  expect(existsSync(`${base}/app/fonts/OFL-MITR.txt`)).toBe(true)
})

test('page + messages: the PDF rides the audited route link (never a prefetching next/link), bilingual copy in both locales', () => {
  const page = read('app/[locale]/admin/export/page.tsx')
  expect(page.includes('/api/export/pdf')).toBe(true)
  expect(page.includes('Link href="/api/export/pdf')).toBe(false)

  type Messages = { admin: { export: Record<string, string> } }
  const en = JSON.parse(read('messages/en.json')) as Messages
  const th = JSON.parse(read('messages/th.json')) as Messages
  expect(Object.keys(th.admin.export).sort()).toEqual(Object.keys(en.admin.export).sort())
  expect(String(en.admin.export.downloadPdf).toUpperCase()).toContain('PDF')
  expect(String(th.admin.export.downloadPdf).trim().length).toBeGreaterThan(0)
})

test('a REAL PDF renders: %PDF header, non-trivial bytes, and its ToUnicode CMap maps the Thai codepoints (embedded Thai, extractable text)', async () => {
  const bytes = await renderSummaryPdf(sampleStats())
  const header = Buffer.from(bytes.subarray(0, 5)).toString('latin1')
  expect(header).toBe('%PDF-')
  // an embedded Thai subset font makes this far past a stub
  expect(bytes.length).toBeGreaterThan(10_000)

  const text = pdfText(bytes)
  expect(text).toContain('beginbfrange')
  // the report title 'รายงาน' + footer 'จาก' codepoints — each must ride the
  // ToUnicode CMap, i.e. the PDF really embedded (and mapped) Thai glyphs:
  // ร ำ ง า น (0E23 0E33 0E07 0E19 0E19…0E22) + จ า ก (0E08 0E32 0E01).
  for (const cp of [0x0e23, 0x0e33, 0x0e07, 0x0e19, 0x0e22, 0x0e08, 0x0e32, 0x0e01]) {
    const hex = cp.toString(16).toUpperCase()
    expect(new RegExp(`<0*${hex}>`, 'i').test(text), `U+${hex} in ToUnicode`).toBe(true)
  }
})

test('pagination: a long report flows onto multiple A4 pages (never one crushed sheet)', async () => {
  const bytes = await renderSummaryPdf(sampleStats(90))
  const raw = Buffer.from(bytes).toString('latin1')
  const pages = (raw.match(/\/Type\s*\/Page[^s]/g) ?? []).length
  expect(pages).toBeGreaterThanOrEqual(2)
})
