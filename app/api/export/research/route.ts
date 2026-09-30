import { NextRequest, NextResponse } from 'next/server'

import {
  exportQuerySchema,
  runExportViaRpc,
  type ExportFormat,
} from '../../../../lib/sup/export'
import {
  buildCsv,
  buildXlsx,
  exportFilename,
  exportStamp,
} from '../../../../lib/sup/exportFormat'

/**
 * Ticket #16 research export: the audited DOWNLOAD — `?format=csv|xlsx|sql`
 * runs `ppg_research_export` (teacher/admin gate → extract → one audit
 * INSERT, all inside the same DB call) and streams the bytes:
 *
 *  - csv  — RFC 4180 escaping, CRLF, UTF-8 BOM (Thai reads in Excel);
 *  - xlsx — a real workbook (write-excel-file, one dependency — fflate);
 *  - sql  — the DB-assembled restorable transaction script (every INSERT
 *    ON CONFLICT DO NOTHING; the header in the dump documents the scope —
 *    learner profiles + the five research tables, never the audit stream).
 *
 * A learner smuggling the URL gets 403 + `permission_denied` from the
 * function's own gate (bytes never stream); a smuggled `pdf` never even
 * parses here (Zod) and the DB gate refuses it too (the PDF report is #17).
 * The empty cohort downloads GRACEFULLY: header-only csv/xlsx, a schema-
 * commented 0-INSERT dump — and the run is still audit-logged.
 * `force-dynamic`: a download never pre-renders.
 */
export const dynamic = 'force-dynamic'

const MEDIA_TYPES: Record<ExportFormat, string> = {
  csv: 'text/csv; charset=utf-8',
  xlsx: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  sql: 'application/sql; charset=utf-8',
}

export async function GET(req: NextRequest) {
  const parsed = exportQuerySchema.safeParse({
    format: new URL(req.url).searchParams.get('format'),
  })

  if (!parsed.success) {
    return NextResponse.json(
      {
        status: 'error',
        detail: parsed.error.issues
          .map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`)
          .join('; '),
      },
      { status: 400 },
    )
  }

  const format = parsed.data.format
  const state = await runExportViaRpc(format)

  if (state.status !== 'ok') {
    const http =
      state.status === 'denied'
        ? 403
        : state.status === 'unauthorized'
          ? 401
          : state.status === 'not-configured'
            ? 503
            : 500
    return NextResponse.json(
      { status: state.status, detail: state.detail },
      { status: http },
    )
  }

  const columns = state.columns ?? []
  const rows = state.rows ?? []
  const stamp = exportStamp()
  const filename = exportFilename(format, stamp)

  let body: BodyInit
  if (format === 'sql') {
    body = state.sqlDump ?? ''
  } else if (format === 'csv') {
    body = buildCsv(columns, rows)
  } else {
    body = new Uint8Array(await buildXlsx(columns, rows))
  }

  return new NextResponse(body, {
    headers: {
      'Content-Type': MEDIA_TYPES[format],
      'Content-Disposition': `attachment; filename="${filename}"`,
      'X-Participant-Count': String(state.participantCount ?? rows.length),
      'Cache-Control': 'no-store',
    },
  })
}
