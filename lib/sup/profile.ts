import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'

/**
 * Ticket #3 profile read: the learner's own profile (or a teacher/admin's view
 * of theirs) is fetched through the Supabase Postgres with the request's
 * session JWT, so RLS (select-learner policy) is what decides whether rows
 * exist. We do NOT use the service-role key (it bypasses RLS) — the anon key
 * with the user's JWT is the authority. Missing env yields `null` (the page
 * shows not-configured).
 */
export interface ProfileRow {
  id: string
  student_id: string
  full_name: string
  role: 'learner' | 'teacher' | 'admin'
}

export interface ProfileState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  row?: ProfileRow
}

export async function readOwnProfile(): Promise<ProfileState> {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY

  if (!url || !anonKey)
    return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  // read-only cookie jar for server-render: the session JWT is carried in,
  // cookies are never written from a page. `next/headers` is async, so the
  // jar is resolved before the (sync) storage callback is built.
  const jar = await cookies()
  const sup = createClient(url, anonKey, {
    auth: {
      storageKey: 'ppga_session',
      storage: {
        isServer: true as const,
        getItem: (key: string) => jar.get(key)?.value ?? null,
        setItem: (key: string, value: string) => undefined,
        removeItem: (key: string) => undefined,
      },
    },
  })

  const { data: session } = await sup.auth.getSession()
  if (!session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup
    .from('ppg_profiles')
    .select('id, student_id, full_name, role')
    .limit(1)

  if (error) return { status: 'error', detail: error.message }
  if (!data || data.length === 0)
    return { status: 'empty', detail: 'RLS denied the profile (or no rows)' }

  return { status: 'ok', row: data[0] as ProfileRow }
}
