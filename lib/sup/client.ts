import { createClient } from '@supabase/supabase-js'

/**
 * Browser Supabase client factory.
 *
 * Only the anon key reaches the browser — NEXT_PUBLIC_* variables are the
 * ones bundled for the client. Missing environment yields `null` so the app
 * can render an "not-configured" state instead of crashing.
 */
export function createBrowserSupabaseClient() {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY

  if (!url || !anonKey) return null

  return createClient(url, anonKey)
}