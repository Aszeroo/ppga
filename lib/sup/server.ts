import 'server-only'

import { createClient } from '@supabase/supabase-js'

/**
 * Server-side Supabase client factory.
 *
 * Only server-side code may read SUP_* variables (the service-role key
 * lives exclusively in environment variables; never bundled to the browser).
 * Missing environment yields `null` so the app renders "not-configured"
 * instead of crashing.
 */
export function createSupabaseServerClient() {
  const url = process.env.SUP_URL
  const serviceRoleKey = process.env.SUP_SERVICE_ROLE_KEY

  if (!url || !serviceRoleKey) return null

  return createClient(url, serviceRoleKey)
}