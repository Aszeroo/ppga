import 'server-only'

import { cookies } from 'next/headers'

import { createClient } from '@supabase/supabase-js'
import { z } from 'zod'

/**
 * Ticket #9 curriculum server module: the Course map read (modules + their
 * real LOCK states), the module detail read (lessons), and the publication
 * toggle RPC for the ADMIN (audit-logged) all run here. The browser never
 * reaches the service-role key; every call carries the request's user JWT so
 * the DATABASE's RLS + the function's own gates decide — a Learner who has
 * not passed the #8 gate reaches the map read as NO rows (the function's own
 * filter), never a smuggled module row; a draft/arched row is INVISIBLE to a
 * Learner (the function's own WHERE), never a hidden UI; a learner/teacher
 * smuggle of the toggle reaches PostgREST as `permission_denied`, never a
 * silently-0-row UPDATE of someone else's publication state. Missing
 * environment yields `not-configured` so the app shows the state, never
 * crashes.
 */
export const contentKeySchema = z
  .string()
  .regex(/^(module-\d{2})|(module-\d{2}-lesson-\d{2})$/i)

export const publicationStateSchema = z.enum(['draft', 'published', 'archived'])

export interface CourseMapState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  modules?: Array<{
    module_key: string
    order_index: number
    skill_domain: string
    title_th: string
    title_en: string
    summary_th: string
    summary_en: string
    publication_state?: 'draft' | 'published' | 'archived'
    lock_state: 'open' | 'locked'
  }>
}

export interface LessonsState {
  status:
    | 'ok'
    | 'empty'
    | 'error'
    | 'denied'
    | 'not-configured'
    | 'unauthorized'
  detail?: string
  lessons?: Array<{
    lesson_key: string
    module_key: string
    order_index: number
    title_th: string
    title_en: string
    what_learn_th: string
    what_learn_en: string
    why_th: string
    why_en: string
    body_th: string
    body_en: string
    what_next_th: string
    what_next_en: string
    publication_state?: 'draft' | 'published' | 'archived'
  }>
}

export interface ToggleResult {
  ok: boolean
  detail?: string
}

/**
 * The session client factory for a curriculum call. The user's JWT (from the
 * request's cookie jar) is the only authority; we do NOT use the service-role
 * key (it bypasses RLS). Missing env yields `null` so the caller shows
 * "not-configured" instead of crashing. The jar is resolved before the (sync)
 * storage callback is built (`next/headers` is async).
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
 * The Course map read: the RPC returns every SEE-ABLE module (published +
 * the #8 gate for a learner; all incl draft/arched for teacher/admin) + the
 * real lock state per row (`open|locked`, the linear rule computed
 * server-side under the CALLER's JWT). A Learner who never passed the gate
 * gets NO rows (the function's own WHERE denies them, never a hidden UI);
 * the locked modules show AS locked (never invisible).
 */
export async function readCourseMapViaRpc(): Promise<CourseMapState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup.rpc('ppg_course_map', {} as never)

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: error.message }
    if (error.message.toLowerCase().includes('violates row-level security'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  if (!data || !Array.isArray(data) || data.length === 0)
    return { status: 'empty', detail: 'no see-able modules (the gate/lock rule denies this caller)' }
  return { status: 'ok', modules: data as CourseMapState['modules'] }
}

/**
 * The module detail read: the lessons a SEE-ABLE module shows (published +
 * the gate + the module OPEN for a learner; all incl draft/arched for
 * teacher/admin). A locked module returns `[]` server-side — the learner
 * sees NO lesson rows, never a hidden UI.
 */
export async function readLessonsViaRpc(moduleKey: string): Promise<LessonsState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  if (!contentKeySchema.safeTest(moduleKey))
    return { status: 'denied', detail: 'module key not in the seeded shape (module-NN)' }

  const { data, error } = await sup.rpc(
    'ppg_module_lessons',
    { p_module_key: moduleKey } as never,
  )

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  if (!data || !Array.isArray(data) || data.length === 0)
    return { status: 'empty', detail: 'no lesson rows (the module is locked or unseen server-side)' }
  return { status: 'ok', lessons: data as LessonsState['lessons'] }
}

/**
 * The publication toggle: the ADMIN's only authoring surface in v1
 * (ADR-0003). One call = one module/lesson UPDATE + exactly one audit
 * INSERT (action `publication`, details old/new state). The function's
 * gate reads the request's JWT so a learner/teacher smuggle the POST as
 * `permission_denied`, never a silently-0-row UPDATE. An invalid state
 * reaches `invalid_publication_state`; a missing target reaches
 * `target_missing`.
 */
export async function togglePublicationViaRpc(
  targetKey: string,
  newState: 'draft' | 'published' | 'archived',
): Promise<ToggleResult> {
  const sup = await createSupaSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { ok: false, detail: 'no session' }

  if (!contentKeySchema.safeTest(targetKey))
    return { ok: false, detail: 'target key not in the seeded shape (module-NN / module-NN-lesson-NN)' }

  const { error } = await sup.rpc(
    'ppg_set_publication',
    {
      p_target_key: targetKey,
      p_new_state: newState,
    } as never,
  )

  if (error) {
    const m = error.message.toLowerCase()
    if (m.includes('permission_denied'))
      return { ok: false, detail: `permission_denied: ${error.message}` }
    if (m.includes('invalid_publication_state'))
      return { ok: false, detail: `invalid_publication_state: ${error.message}` }
    if (m.includes('target_missing'))
      return { ok: false, detail: `target_missing: ${error.message}` }
    return { ok: false, detail: error.message }
  }
  return { ok: true, detail: 'publication state stored; one audit event written' }
}
