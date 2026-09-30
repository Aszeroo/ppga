import path from 'node:path'
import { readFileSync } from 'node:fs'

import PDFDocument from 'pdfkit'

/**
 * Ticket #17 PDF summary report: the PRINTABLE RENDERER — a pure
 * jsonb-stats → PDF-bytes function with ZERO statistics of its own (every
 * number the report prints is a number `ppg_pdf_summary()` already computed
 * in the database; the renderer only formats). Bilingual by construction:
 * every label rides "ไทย (English)" so ONE document serves both readers, and
 * the seeded rubric criterion labels (label_th/label_en) come FROM THE
 * DATABASE, not a copy here.
 *
 * Dependency & font decisions (the Thai-glyph risk the ticket flags):
 *  - pdfkit: the smallest reliable server-side PDF lib with real TTF
 *    embedding (pure JS, no native binary, no headless browser).
 *  - Mitr (PRD Thai body font, Cadson Demak, OFL-1.1 — vendored static TTFs
 *    in app/fonts/, licenses in app/fonts/OFL-MITR.txt): its cmap carries
 *    the Thai block (verified: U+0E01..U+0E5B glyph-mapped, so the embedded
 *    subset really draws Thai, and the written ToUnicode CMap keeps the
 *    text extractable). Headings use Mitr SEMIBOLD instead of TA 16 BIT:
 *    TA 16 BIT is the app's 8-bit LATINESE display face — its Thai glyphs
 *    are pixel-block novelties, unreadable at print sizes (the app itself
 *    already falls back to Mitr per glyph for Thai — see app/layout.tsx) —
 *    so the PDF keeps ONE legible family in two weights.
 *  - pdfkit flows text across pages automatically and the footer stamps
 *    "หน้า i จาก n" on EVERY page (pagination); black-on-white body, #333
 *    secondary text and #777 rules hold print contrast.
 *  - null stats (empty cohort) print an em dash — never NaN, never a crash.
 *
 * The font files are read from `app/fonts` via process.cwd() — both
 * `next dev` and `next start` run from the project root; a standalone
 * serverless build would need the TTFs bundled alongside (documented here
 * because it is the renderer's only environment assumption).
 */

const FONT_DIR = path.join(process.cwd(), 'app', 'fonts')
const FONT_BODY = path.join(FONT_DIR, 'Mitr-Regular.ttf')
const FONT_HEAD = path.join(FONT_DIR, 'Mitr-SemiBold.ttf')

/** One criterion's distribution as `ppg_pdf_summary()` emits it. */
export interface PdfCriterionStats {
  ordinal: number
  criterion: string
  label_th: string
  label_en: string
  reviews: number
  mean: number | null
  counts: Record<string, number>
}

/** The exact jsonb shape `ppg_pdf_summary()` returns (the DB is the author). */
export interface PdfSummaryStats {
  generated_at: string
  participant_count: number
  pretest: { submitted_count: number; mean: number | null; min: number | null; max: number | null }
  posttest: { submitted_count: number; mean: number | null; min: number | null; max: number | null }
  rubric: {
    review_count: number
    total_mean: number | null
    decisions: { approved: number; needs_improvement: number }
    total_distribution: Record<string, number>
    criteria: PdfCriterionStats[]
  }
  satisfaction: {
    submitted_count: number
    items: Array<{ item: string; tallies: Record<string, number> }>
  }
}

/** A database-produced integer reads verbatim; NULL (empty) is an em dash. */
function fmtInt(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : String(v)
}

/** A round(x,2) mean rides toFixed(2) — the SAME two decimals Postgres sent. */
function fmtMean(v: number | null | undefined): string {
  return v === null || v === undefined ? '—' : Number(v).toFixed(2)
}

/** "ไทย (English)" with no duplicated English when the seeded label already carries it. */
function bilingual(labelTh: string, labelEn: string): string {
  return labelTh.includes(labelEn) ? labelTh : `${labelTh} (${labelEn})`
}

function ensureSpace(doc: PDFKit.PDFDocument, needed: number): void {
  const bottom = doc.page.height - doc.page.margins.bottom
  if (doc.y + needed > bottom) doc.addPage()
}

function sectionHeading(doc: PDFKit.PDFDocument, text: string): void {
  ensureSpace(doc, 60)
  doc.moveDown(0.9)
  doc.font('head').fontSize(13).fillColor('#000000').text(text, { lineBreak: true })
  const y = doc.y + 1
  doc
    .moveTo(doc.page.margins.left, y)
    .lineTo(doc.page.width - doc.page.margins.right, y)
    .lineWidth(0.8)
    .stroke('#000000')
  doc.moveDown(0.45)
}

/** Label/value rows with a rule each — the report's readable print form. */
function keyValues(doc: PDFKit.PDFDocument, rows: Array<[string, string]>): void {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  for (const [label, value] of rows) {
    ensureSpace(doc, 24)
    const y = doc.y
    doc.font('body').fontSize(9.5).fillColor('#000000').text(label, left, y, {
      width: right - left - 72,
      lineBreak: true,
    })
    const labelEnd = doc.y
    doc.font('body').fontSize(9.5).fillColor('#000000').text(value, right - 66, y, {
      width: 66,
      align: 'right',
      lineBreak: false,
    })
    const rowEnd = Math.max(labelEnd, y + 13)
    doc
      .moveTo(left, rowEnd + 2)
      .lineTo(right, rowEnd + 2)
      .lineWidth(0.4)
      .stroke('#777777')
    doc.y = rowEnd + 7
  }
}

/** A simple two-column table (band | count style) with a bold header. */
function twoColumnTable(
  doc: PDFKit.PDFDocument,
  headerTh: string,
  headerEn: string,
  rows: Array<[string, string]>,
): void {
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  ensureSpace(doc, 26)
  let y = doc.y
  doc.font('head').fontSize(9).fillColor('#333333').text(bilingual(headerTh, headerEn), left, y, {
    width: right - left - 80,
    lineBreak: false,
  })
  doc.text('จำนวน (Count)', right - 74, y, { width: 74, align: 'right', lineBreak: false })
  y = doc.y + 3
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.8).stroke('#000000')
  doc.y = y + 4
  keyValues(
    doc,
    rows.map(([a, b]) => [a, b]),
  )
}

function writeReport(doc: PDFKit.PDFDocument, stats: PdfSummaryStats): void {
  // The TTFs ride as Uint8Array BUFFERS (the path form dies in pdfkit's
  // DataStream resolver under a bundled server runtime, and a Node Buffer
  // fails its `instanceof Uint8Array` check across module realms — a plain
  // Uint8Array is the one input every build reads identically).
  doc.registerFont('body', new Uint8Array(readFileSync(FONT_BODY)))
  doc.registerFont('head', new Uint8Array(readFileSync(FONT_HEAD)))
  doc.font('body')

  // ---- Title block (bilingual; Thai first per the Thai-default rule) ----
  doc
    .font('head')
    .fontSize(19)
    .fillColor('#000000')
    .text('รายงานสรุปผลระดับกลุ่มผู้เรียน', { lineBreak: true })
  doc
    .font('head')
    .fontSize(13)
    .fillColor('#333333')
    .text('PPGA Cohort Summary Report', { lineBreak: true })
  doc.font('body').fontSize(9).fillColor('#333333')
  doc.text(`จัดทำเมื่อ (Generated): ${stats.generated_at}`, { lineBreak: true })
  doc.text(`จำนวนผู้เรียน (Participants): ${fmtInt(stats.participant_count)}`, { lineBreak: true })
  if (stats.participant_count === 0) {
    doc.fillColor('#333333').text(
      'กลุ่มผู้เรียนยังว่าง — ทุกจำนวนต่อไปนี้เป็น 0 และทุกค่าเฉลี่ยเป็นขีดกลาง (The cohort is empty — every count below is 0 and every mean is a dash — never an error.)',
      { lineBreak: true },
    )
  }
  doc.fillColor('#000000')

  // ---- 1/2. Pre-Test & Post-Test means --------------------------------------
  const testRows = (t: PdfSummaryStats['pretest']): Array<[string, string]> => [
    ['จำนวนผู้ส่งคำตอบ (Submitted)', fmtInt(t.submitted_count)],
    ['คะแนนเฉลี่ย (Mean)', fmtMean(t.mean)],
    ['คะแนนต่ำสุด (Min)', fmtInt(t.min)],
    ['คะแนนสูงสุด (Max)', fmtInt(t.max)],
  ]
  sectionHeading(doc, 'ผลการทดสอบก่อนเรียน (Pre-Test Results)')
  keyValues(doc, testRows(stats.pretest))
  sectionHeading(doc, 'ผลการทดสอบหลังเรียน (Post-Test Results)')
  keyValues(doc, testRows(stats.posttest))

  // ---- 3. Rubric distributions ----------------------------------------------
  sectionHeading(doc, 'การกระจายคะแนนรูบริก (Rubric Score Distribution)')
  doc
    .font('body')
    .fontSize(9.5)
    .fillColor('#000000')
    .text(
      `จำนวนรอบที่รีวิว (Reviews): ${fmtInt(stats.rubric.review_count)}    ` +
        `คะแนนรวมเฉลี่ย (Total Mean): ${fmtMean(stats.rubric.total_mean)}`,
      { lineBreak: true },
    )
  doc
    .text(
      `ผลการตัดสิน (Decisions) — อนุมัติ (Approved): ${fmtInt(stats.rubric.decisions.approved)}    ` +
        `ควรปรับปรุง (Needs Improvement): ${fmtInt(stats.rubric.decisions.needs_improvement)}`,
      { lineBreak: true },
    )
  doc.moveDown(0.5)
  // jsonb objects sort their keys lexically ('14-20' before '7-13') — the
  // printed bands ride ASCENDING numeric order, whatever the jsonb says.
  const bandOrder = Object.keys(stats.rubric.total_distribution).sort(
    (a, b) => Number(a.split('-')[0]) - Number(b.split('-')[0]),
  )
  twoColumnTable(
    doc,
    'ช่วงคะแนนรวม',
    'Total Score Band',
    bandOrder.map((band) => [band, fmtInt(stats.rubric.total_distribution[band])]),
  )

  // The 7-criterion table: bilingual labels (from the seeded criteria rows)
  // + mean + the 1–5 tally per score.
  ensureSpace(doc, 60)
  const left = doc.page.margins.left
  const right = doc.page.width - doc.page.margins.right
  const labelW = right - left - 168
  let y = doc.y
  doc.font('head').fontSize(8.5).fillColor('#333333')
  doc.text('เกณฑ์ (Criterion)', left, y, { width: labelW, lineBreak: false })
  doc.text('เฉลี่ย (Mean)', left + labelW + 4, y, { width: 54, align: 'right', lineBreak: false })
  for (let s = 1; s <= 5; s++) {
    doc.text(String(s), left + labelW + 66 + (s - 1) * 20, y, {
      width: 18,
      align: 'right',
      lineBreak: false,
    })
  }
  y = doc.y + 3
  doc.moveTo(left, y).lineTo(right, y).lineWidth(0.8).stroke('#000000')
  doc.y = y + 4
  doc.font('body').fontSize(8.5).fillColor('#000000')
  for (const c of stats.rubric.criteria) {
    const rowY = doc.y
    doc.text(bilingual(c.label_th, c.label_en), left, rowY, { width: labelW, lineBreak: true })
    const afterLabel = doc.y
    doc.text(fmtMean(c.mean), left + labelW + 4, rowY, { width: 54, align: 'right', lineBreak: false })
    for (let s = 1; s <= 5; s++) {
      doc.text(fmtInt(c.counts[String(s)]), left + labelW + 66 + (s - 1) * 20, rowY, {
        width: 18,
        align: 'right',
        lineBreak: false,
      })
    }
    const rowEnd = Math.max(afterLabel, rowY + 12)
    doc
      .moveTo(left, rowEnd + 2)
      .lineTo(right, rowEnd + 2)
      .lineWidth(0.4)
      .stroke('#777777')
    doc.y = rowEnd + 6
  }

  // ---- 4. Satisfaction tallies -----------------------------------------------
  sectionHeading(doc, 'สรุปความพึงพอใจ (Satisfaction Tallies)')
  doc.font('body').fontSize(9.5).fillColor('#000000')
  doc.text(`จำนวนผู้ส่งแบบสอบถาม (Submitted): ${fmtInt(stats.satisfaction.submitted_count)}`, {
    lineBreak: true,
  })
  if (stats.satisfaction.items.length === 0) {
    doc
      .fillColor('#333333')
      .text('— ยังไม่มีคำตอบ (No survey responses yet.)', { lineBreak: true })
      .fillColor('#000000')
  }
  stats.satisfaction.items.forEach((item, index) => {
    ensureSpace(doc, 24)
    const tallies = Object.keys(item.tallies)
      .sort()
      .map((choice) => `${choice}: ${fmtInt(item.tallies[choice])}`)
      .join('    ')
    const rowY = doc.y
    doc
      .font('body')
      .fontSize(9.5)
      .fillColor('#000000')
      .text(`ข้อ ${index + 1} (${item.item})`, left, rowY, {
        width: labelW,
        lineBreak: false,
      })
    const afterItem = doc.y
    doc.text(tallies || '—', right - 220, rowY, { width: 220, align: 'right', lineBreak: false })
    const rowEnd = Math.max(afterItem, rowY + 12)
    doc
      .moveTo(left, rowEnd + 2)
      .lineTo(right, rowEnd + 2)
      .lineWidth(0.4)
      .stroke('#777777')
    doc.y = rowEnd + 6
  })

  // ---- Footnote: the provenance line (both languages) ------------------------
  doc.moveDown(1.1)
  doc
    .font('body')
    .fontSize(7.5)
    .fillColor('#333333')
    .text(
      'สถิติทุกตัวคำนวณในฐานข้อมูลด้วยคำสั่งเดียวพร้อมบันทึกเหตุการณ์ตรวจสอบ — ' +
        'All statistics are computed in the database (ppg_pdf_summary) and every ' +
        'generation writes one audit event (ADR-0002).',
      { lineBreak: true },
    )
}

/**
 * Render the report's PDF bytes from the RPC's jsonb stats. Returns the whole
 * document (the report is a handful of A4 pages — streaming chunking would
 * add nothing the download needs).
 */
export function renderSummaryPdf(stats: PdfSummaryStats): Promise<Uint8Array> {
  const doc = new PDFDocument({
    size: 'A4',
    margin: 54,
    bufferPages: true,
    info: {
      Title: 'PPGA Cohort Summary Report — รายงานสรุปผลระดับกลุ่มผู้เรียน',
      Author: 'PPGA (issue #17)',
    },
  })
  const chunks: Buffer[] = []
  return new Promise<Uint8Array>((resolve, reject) => {
    doc.on('data', (chunk: Buffer) => chunks.push(Buffer.from(chunk)))
    doc.on('end', () => resolve(new Uint8Array(Buffer.concat(chunks))))
    doc.on('error', reject)
    writeReport(doc, stats)
    // Per-page bilingual footer: "หน้า i จาก n (Page i of n)" — the
    // printability/pagination marker on EVERY page (buffered pages are
    // stamped, then flushed before the document ends).
    const range = doc.bufferedPageRange()
    for (let i = 0; i < range.count; i++) {
      doc.switchToPage(range.start + i)
      const page = doc.page
      doc
        .font('body')
        .fontSize(7.5)
        .fillColor('#333333')
        .text(
          `หน้า ${i + 1} จาก ${range.count} (Page ${i + 1} of ${range.count})`,
          page.margins.left,
          page.height - page.margins.bottom + 12,
          {
            width: page.width - page.margins.left - page.margins.right,
            align: 'center',
            lineBreak: false,
          },
        )
    }
    doc.flushPages()
    doc.end()
  })
}
