import { NextRequest, NextResponse } from 'next/server'

import {
  posttestFormSchema,
  upsertPosttestAutosaveViaRpc,
} from '../../../../lib/sup/posttest'

/**
 * Ticket #15 Post-Test autosave: the debounced save posts the
 * `ppg_posttest_upsert` RPC — the function's UPDATE of the CALLER's own
 * response row under their own JWT + RLS (a smuggled autosave value from the
 * browser can never write someone else's row). BEFORE a submit only: a
 * post-submit upsert reaches the immutable trigger, never a silent
 * overwrite. The gated row start (`ppg_posttest_start`) rides first —
 * idempotent, unlock-gated: a learner whose Final Project was never accepted
 * reaches `final_project_not_accepted`, never a silently-started Post-Test.
 * `force-dynamic` so `next build` never pre-render a POST.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { autosave?: Record<string, unknown> | null; language?: string | null }
  if (ct.includes('application/json')) {
    body = await req
      .json()
      .catch(() => ({}) as never)
  } else {
    const form = await req
      .formData()
      .catch(() => new FormData() as never)
    const entries = [...form]
    body = {
      autosave: Object.fromEntries(
        entries.filter(([k]) => k !== 'language'),
      ) as Record<string, unknown> | null,
      language: form.get('language') as string | null,
    }
  }

  const parsed = posttestFormSchema.safeParse({
    answers: undefined,
    autosave: body.autosave ?? undefined,
    language: body.language ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const result = await upsertPosttestAutosaveViaRpc(parsed.data.autosave, parsed.data.language)
  return NextResponse.json(result)
}
