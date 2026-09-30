import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Ticket #16 research-export server module: the Export page's three formats
 * (CSV / XLSX / SQL) ride ONE server flow — the browser never reaches the
 * service-role key; every call carries the request's user JWT so the
 * DATABASE's function gate decides: a learner smuggles `/api/export/*` as
 * `permission_denied` (never roster bytes), and the export-format gate
 * refuses even a smuggled `pdf` (the PDF report is issue #17). The audit
 * event rides the SAME DB call inside `ppg_research_export` (ADR-0002) —
 * this module never writes it twice, never writes it client-side.
 * Missing environment yields `not-configured` so the page shows the state,
 * never crashes.
 */
const exportFormatSchema = z.enum(['csv', 'xlsx', 'sql'])
export type ExportFormat = z.infer<typeof exportFormatSchema>

export const exportQuerySchema = z.object({
  format: exportFormatSchema,
})

export interface ExportFileState {
  status:
    | 'ok'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  format?: ExportFormat
  participantCount?: number
  columns?: string[]
  rows?: Array<Record<string, unknown>>
  sqlDump?: string | null
}

export interface ExportPreviewState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  counts?: {
    participant_count: number
    pretest_submitted: number
    posttest_submitted: number
    survey_submitted: number
    rubric_review_count: number
    submission_count: number
  }
}

/**
 * The session client factory for an export call — the admin console's pattern
 * (see lib/sup/admin.ts): the user's JWT (from the request's cookie jar) is
 * the only authority; we do NOT use the service-role key (it bypasses RLS).
 */
async function createSupaSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY
  if (!url || !anonKey) return null

  const jar = await cookies()
  return createClient(url, anonKey, {
    auth: {
      storageKey: 'ppga_session',
      storage: {
        isServer: true as const,
        getItem: (key: string) => jar.get(key)?.value ?? null,
        setItem: () => undefined,
        removeItem: () => undefined,
      },
    },
  })
}

/**
 * The export RUN — one RPC call: the teacher/admin gate, the format gate,
 * the extract, and EXACTLY one audit INSERT happen inside the database in
 * the same call. The caller only streams what comes back.
 */
export async function runExportViaRpc(format: ExportFormat): Promise<ExportFileState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup.rpc(
    'ppg_research_export',
    { p_format: format } as never,
  )

  if (error) {
    const message = error.message
    if (message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: message }
    return { status: 'error', detail: message }
  }

  const payload = data as {
    participant_count: number
    columns: string[]
    rows: Array<Record<string, unknown>>
    sql_dump: string | null
  }

  return {
    status: 'ok',
    format,
    participantCount: payload.participant_count,
    columns: payload.columns,
    rows: payload.rows,
    sqlDump: payload.sql_dump,
  }
}

/**
 * The Export page's state read — participants + per-instrument counts. The
 * same teacher/admin gate, but NO audit: a page view is not an export run.
 * `empty` is the graceful empty-cohort state (0 participants) — the
 * downloads still work (header-only files) and are still audit-logged.
 */
export async function previewExportViaRpc(): Promise<ExportPreviewState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup.rpc('ppg_research_export_preview')

  if (error) {
    const message = error.message
    if (message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: message }
    return { status: 'error', detail: message }
  }

  const counts = data as ExportPreviewState['counts']
  if (!counts || counts.participant_count === 0)
    return { status: 'empty', detail: 'no learner rows yet', counts }

  return { status: 'ok', counts }
}
