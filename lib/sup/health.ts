import 'server-only'

import { createSupabaseServerClient } from './server'

/** Connectivity status shape the health page and /api/health share. */
export interface HealthStatus {
  status: 'ok' | 'error' | 'not-configured'
  detail?: string
}

/**
 * Perform a real Postgres query through the Supabase server client against the
 * scaffold baseline table (`ppg_health`) and report connectivity with proper
 * loading / empty / error handling.
 */
export async function checkDatabaseConnectivity(): Promise<HealthStatus> {
  const supabase = createSupabaseServerClient()

  if (!supabase) {
    return { status: 'not-configured', detail: 'SUP_URL / SUP_SERVICE_ROLE_KEY missing' }
  }

  const { data, error } = await supabase
    .from('ppg_health')
    .select('ok')
    .limit(1)

  if (error) {
    return { status: 'error', detail: error.message }
  }

  if (!data || data.length === 0) {
    return { status: 'error', detail: 'ppg_health returned no rows' }
  }

  return { status: 'ok', detail: String(data[0].ok) }
}