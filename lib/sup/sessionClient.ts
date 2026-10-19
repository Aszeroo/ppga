import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'

/**
 * The shared session client for server-side reads (the hub read and the
 * profile read — the two newest readers). The user's JWT (from the request's
 * cookie jar) is the only authority; we do NOT use the service-role key (it
 * bypasses RLS). Missing env yields `null`/`not-configured` so the caller
 * shows the state, never crashes. The jar is resolved before the (sync)
 * storage callback is built (`next/headers` is async).
 *
 * (PPGA #43: extracted verbatim from `profile.ts`'s inline client build so
 * the hub read reuses ONE copy of the factory — the shipped per-module
 * copies (`curriculum.ts`, `xp.ts`, …) predate this ticket and stay as they
 * are; NEW code shares.)
 */
export async function createSupaSessionClient() {
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
