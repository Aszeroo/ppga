import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'

import type { PdfSummaryStats } from '../pdf/summaryReport'

/**
 * Ticket #17 PDF summary server module: the report's ONE RPC call. The
 * browser never reaches the service-role key; the request's user JWT rides
 * the call and the DATABASE's function gate decides — a learner smuggling
 * `/api/export/pdf` gets `permission_denied` (never report bytes), and the
 * audit event is written INSIDE the same DB call (ADR-0002 — this module
 * never writes it twice, never writes it client-side). No statistics live
 * here either: `ppg_pdf_summary()` is the only author of the numbers.
 * Missing environment yields `not-configured` so the page shows state, never
 * crashes (#16's shape, one-for-one).
 */
export interface PdfSummaryState {
  status: 'ok' | 'error' | 'denied' | 'not-configured' | 'unauthorized'
  detail?: string
  stats?: PdfSummaryStats
}

/**
 * The session client factory for the summary call — the #16 export pattern
 * (lib/sup/export.ts): the user's JWT (from the request's cookie jar) is the
 * only authority; the service-role key (which bypasses RLS) is never used.
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
 * The report RUN — one RPC call: the teacher/admin gate, every statistic
 * (pre/post means, rubric distributions, satisfaction tallies) and EXACTLY
 * one audit INSERT happen inside the database in the same call. The caller
 * only renders what comes back.
 */
export async function runPdfSummaryViaRpc(): Promise<PdfSummaryState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup.rpc('ppg_pdf_summary')

  if (error) {
    const message = error.message
    if (message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: message }
    return { status: 'error', detail: message }
  }

  return { status: 'ok', stats: data as PdfSummaryStats }
}
