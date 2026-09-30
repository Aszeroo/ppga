import writeExcelFile from 'write-excel-file/node'

/**
 * Ticket #16 export serializers: the DATABASE already derived the extract
 * (`ppg_research_export` — identity, joins, rubric totals); this module is
 * the pure BYTE layer only — CSV/XLSX encoding of the columns+rows the RPC
 * returned (the SQL dump rides the DB's own restorable text and never passes
 * through here). No session, no RPC, no env — so the seam/unit tests exercise
 * the exact bytes the download routes stream (the module deliberately has no
 * `server-only` import; the routes that call it are server-only).
 */

/** A cell as it leaves the RPC: scalars + jsonb objects + nulls. */
export type ExportCell =
  | string
  | number
  | boolean
  | null
  | Record<string, unknown>
  | unknown[]

const needsQuotes = (value: string): boolean =>
  /[",\r\n]/.test(value)

/** One CSV cell: null → empty; jsonb → compact JSON; commas/quotes/newlines
 * quoted per RFC 4180 (doubled quotes); Thai rides raw UTF-8 (the BOM the
 * builder prepends is what makes Excel read it correctly). */
export function csvCell(value: ExportCell): string {
  if (value === null || value === undefined) return ''
  if (typeof value === 'number' || typeof value === 'boolean')
    return String(value)
  const text = typeof value === 'string' ? value : JSON.stringify(value)
  return needsQuotes(text) ? `"${text.replace(/"/g, '""')}"` : text
}

/**
 * The CSV file: UTF-8 BOM (Excel on Windows reads Thai only with it), CRLF
 * line breaks, the column keys as the header row, one line per participant.
 * The empty cohort is a HEADER-ONLY file — a valid CSV, not an error.
 */
export function buildCsv(
  columns: string[],
  rows: Array<Record<string, unknown>>,
): string {
  const lines = [columns.map((c) => csvCell(c)).join(',')]
  for (const row of rows) {
    lines.push(columns.map((c) => csvCell(row[c] as ExportCell)).join(','))
  }
  // The UTF-8 BOM as an explicit escape, never a literal byte.
  return '\uFEFF' + lines.join('\r\n') + '\r\n'
}

/**
 * The XLSX file: a real .xlsx workbook (write-excel-file, one dependency —
 * fflate) built from the same columns+rows. Numbers stay numeric cells,
 * nulls stay empty cells; the empty cohort is a header-only sheet.
 */
export async function buildXlsx(
  columns: string[],
  rows: Array<Record<string, unknown>>,
): Promise<Buffer> {
  type Cell =
    | { value: string; fontWeight: 'bold' }
    | string
    | number
    | boolean
    | null
  const sheet: Cell[][] = [
    // the header row: bold cell objects; data rows ride RAW primitives — the
    // writer infers Number/Boolean/String from the value's own type (a
    // hand-typed `type` string is rejected by the library: "Unknown type").
    columns.map((c): Cell => ({ value: c, fontWeight: 'bold' })),
    ...rows.map((row) =>
      columns.map((c): Cell => {
        const raw = row[c] as ExportCell
        if (raw === null || raw === undefined) return null
        if (typeof raw === 'number' || typeof raw === 'boolean') return raw
        return typeof raw === 'string' ? raw : JSON.stringify(raw)
      }),
    ),
  ]
  return writeExcelFile(sheet).toBuffer()
}

/** `20260930T142305Z` — the UTC stamp inside every export filename (the run
 * is what the audit event records; the filename mirrors it). */
export function exportStamp(now: Date = new Date()): string {
  return now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

/** The download's filename for a format: stable, sortable, extension-honest. */
export function exportFilename(format: 'csv' | 'xlsx' | 'sql', stamp: string): string {
  return `ppga-research-export-${stamp}.${format}`
}
