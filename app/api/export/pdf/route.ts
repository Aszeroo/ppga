import { NextResponse } from 'next/server'

import { exportStamp } from '../../../../lib/sup/exportFormat'
import { runPdfSummaryViaRpc } from '../../../../lib/sup/pdfSummary'
import { renderSummaryPdf } from '../../../../lib/pdf/summaryReport'

/**
 * Ticket #17 PDF summary report: the audited DOWNLOAD — `GET` runs
 * `ppg_pdf_summary()` (teacher/admin gate → every statistic → one audit
 * INSERT, all inside the same DB call) and streams a printable bilingual
 * PDF (Thai + English labels on every line, Mitr embedded so Thai glyphs
 * really render, black-on-white contrast, per-page footers + automatic
 * pagination).
 *
 * A learner smuggling the URL gets 403 + `permission_denied` from the
 * function's own gate (bytes never stream, no audit event for a denied
 * smuggle); the empty cohort downloads GRACEFULLY (every count 0, every
 * mean an em dash — never a NaN) and the run is STILL audit-logged. No
 * statistics live in this layer: the numbers are the database's, rendered
 * verbatim. `force-dynamic`: a download never pre-renders.
 */
export const dynamic = 'force-dynamic'

export async function GET() {
  const state = await runPdfSummaryViaRpc()

  if (state.status !== 'ok' || !state.stats) {
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

  const pdf = await renderSummaryPdf(state.stats)

  return new NextResponse(new Uint8Array(pdf), {
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="ppga-summary-report-${exportStamp()}.pdf"`,
      'X-Participant-Count': String(state.stats.participant_count),
      'Cache-Control': 'no-store',
    },
  })
}
