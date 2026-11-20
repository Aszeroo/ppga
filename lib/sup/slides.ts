import 'server-only'

import { createSupaSessionClient } from './sessionClient'

/**
 * Lesson slide gallery read: the ordered slide catalog for one chapter.
 *
 * The chapter page already owns the visibility decision (a locked chapter
 * returns no lessons and no tests), so this read is a plain RLS SELECT for
 * the authenticated caller. The public Storage URLs are assembled in the
 * browser component from the `storage_path` column; no service-role key ever
 * reaches this module.
 */

export type SlidesStatus =
  | 'ok'
  | 'empty'
  | 'error'
  | 'denied'
  | 'not-configured'
  | 'unauthorized'

export interface SlideRow {
  module_key: string
  order_index: number
  storage_path: string
  alt_th: string
  alt_en: string
}

export interface SlidesState {
  status: SlidesStatus
  detail?: string
  slides?: SlideRow[]
}

export async function readLessonSlidesViaTable(moduleKey: string): Promise<SlidesState> {
  const sup = await createSupaSessionClient()
  if (!sup) return { status: 'not-configured', detail: 'NEXT_PUBLIC_SUP_* missing' }

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) return { status: 'unauthorized', detail: 'no session' }

  const { data, error } = await sup
    .from('ppg_lesson_slides')
    .select('module_key, order_index, storage_path, alt_th, alt_en')
    .eq('module_key', moduleKey)
    .order('order_index', { ascending: true })

  if (error) {
    if (error.message.toLowerCase().includes('permission_denied'))
      return { status: 'denied', detail: error.message }
    if (error.message.toLowerCase().includes('violates row-level security'))
      return { status: 'denied', detail: error.message }
    return { status: 'error', detail: error.message }
  }

  if (!data || data.length === 0)
    return { status: 'empty', detail: 'no slide rows for this chapter' }

  return { status: 'ok', slides: data as SlideRow[] }
}
