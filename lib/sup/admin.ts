import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Ticket #6 admin console server module: the users list, the role-change RPC
 * and the audit read all run here. The browser never reaches the service-role
 * key; every call carries the request's user JWT so the DATABASE's RLS + the
 * function's own gate decide — a teacher/learner smuggles the call as
 * `permission_denied`, never a roster they did not get. Missing environment
 * yields `not-configured` so the console shows the state, never crashes.
 */
export const ppg_roleSchema = z.enum(['learner', 'teacher', 'admin'])

export const uuidSchema = z
  .string()
  .regex(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{32}$/i)

export const roleChangeFormSchema = z
  .object({
    target_id: uuidSchema,
    new_role: ppg_roleSchema,
  })
  .strict()

export const usersPageSchema = z
  .object({
    page: z.number().int().min(0).default(0),
  })
  .strict()

export interface UsersState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  rows?: Array<{
    id: string
    student_id: string
    full_name: string
    role: 'learner' | 'teacher' | 'admin'
    created_at: string
  }>
}

export interface RoleChangeResult {
  ok: boolean
  detail?: string
}

export interface AuditState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  events?: Array<{
    id: string
    actor_id: string | null
    action: string
    target_type: string
    target_id: string
    details: Record<string, string>
    created_at: string
  }>
}

/**
 * The session client factory for an admin-gated call. The user's JWT (from
 * the request's cookie jar) is the only authority; we do NOT use the
 * service-role key (it bypasses RLS). Missing env yields `null` so the
 * caller shows "not-configured" instead of crashing. The jar is resolved
 * before the (sync) storage callback is built (`next/headers` is async).
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

/** The admin-only user-list RPC — page-20, ordered by student_id. */
export async function listUsersViaRpc(page: number): Promise<UsersState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  // The function's gate + profiles' RLS speak; a teacher/learner caller
  // reaches PostgREST as `permission_denied` (SQLSTATE family).
  const { data, error } = await sup.rpc(
    'ppg_admin_users_list',
    { p_page: page } as never,
  )

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  if (!data || data.length === 0) return { status: 'empty', detail: 'no profiles on this page' }
  return { status: 'ok', rows: data as UsersState['rows'] }
}

/** The admin-only role-change RPC — one call, one UPDATE + one audit INSERT. */
export async function changeRoleViaRpc(
  targetId: string,
  newRole: 'learner' | 'teacher' | 'admin',
): Promise<RoleChangeResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  const { error } = await sup.rpc(
    'ppg_change_role',
    {
      p_new_role: newRole,
      p_target_id: targetId,
    } as never,
  )

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { ok: false, detail: `permission_denied: ${error.message}` }
    return { ok: false, detail: error.message }
  }
  return { ok: true, detail: 'role stored; one audit event written' }
}

/** The admin-only audit read — latest first; the table's own no UPDATE/DELETE
 * policies make it append-only, the function's gate denies a teacher/learner. */
export async function readAuditViaTable(
  limit: number = 50,
): Promise<AuditState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  // The function's gate + the table's own policies speak; a teacher/learner
  // caller reaches PostgREST as `permission_denied` (SQLSTATE family).
  const { data, error } = await sup.rpc(
    'ppg_admin_audit_list',
    { p_limit: limit } as never,
  )

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  if (!data || data.length === 0)
    return { status: 'empty', detail: 'no audit events (read granted, table empty)' }

  return { status: 'ok', events: data as AuditState['events'] }
}
