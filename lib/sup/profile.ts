import 'server-only'

import { createClient } from '@supabase/supabase-js'

import { createSupaSessionClient } from './sessionClient'

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
  locale: 'th' | 'en'
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
  // read-only cookie jar for server-render: the session JWT is carried in,
  // cookies are never written from a page (the shared factory — PPGA #43
  // extracted it so the hub read reuses ONE copy).
  const sup = await createSupaSessionClient()
  if (!sup)
    return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  const uid = session.session?.user.id
  if (!uid) return { status: 'unauthorized', detail: 'no session' }

  // OWN row, by the session's own user id: the `ppg_profiles_select` policy
  // lets a teacher/admin see the WHOLE table (the queue/provisioning reads),
  // so an unfiltered `limit(1)` would hand back SOMEONE ELSE's row (the
  // first by physical order — the admin) — Ticket #41 stage 1's Shell role
  // read proved this: a Teacher rendered the admin's nav. The id filter is
  // the function's OWN name: `readOwnProfile`.
  const { data, error } = await sup
    .from('ppg_profiles')
    .select('id, student_id, full_name, role, locale')
    .eq('id', uid)
    .limit(1)

  if (error) return { status: 'error', detail: error.message }
  if (!data || data.length === 0)
    return { status: 'empty', detail: 'RLS denied the profile (or no rows)' }

  return { status: 'ok', row: data[0] as ProfileRow }
}

/**
 * Ticket #4 locale persistence: a learner (or a teacher/admin for their own
 * row) updates the `locale` column on their own profile only — Ticket #3's
 * `ppg_profiles_update` policy is the authority, the CHECK never lets a
 * learner change their role. The route carries the user's JWT (the anon key
 * is what PostgREST speaks with) so the update is RLS-gated, never service-
 * role.
 */
export interface LocaleUpdateResult {
  ok: boolean
  detail?: string
}

export async function updateOwnLocale(
  sup: ReturnType<typeof createClient>,
  locale: 'th' | 'en',
): Promise<LocaleUpdateResult> {
  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  const { error } = await sup
    .from('ppg_profiles')
    .update({ locale } as never)
    .eq('id', session.session.user.id)

  if (error) return { ok: false, detail: error.message }

  return { ok: true, detail: 'locale stored on profile' }
}
