import { NextRequest, NextResponse } from 'next/server'

import {
  surveyFormSchema,
  upsertSurveyAutosaveViaRpc,
} from '../../../../lib/sup/survey'

/**
 * Ticket #15 Survey autosave: the debounced save posts the
 * `ppg_survey_upsert` RPC — the function's UPDATE of the CALLER's own
 * response row under their own JWT + RLS. BEFORE a submit only: a post-submit
 * upsert reaches the immutable trigger, never a silent overwrite. The gated
 * row start (`ppg_survey_start`) rides first — idempotent, unlock-gated: a
 * learner whose Post-Test was never submitted reaches
 * `posttest_not_submitted`, never a silently-early Survey. `force-dynamic`
 * so `next build` never pre-render a POST.
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

  const parsed = surveyFormSchema.safeParse({
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

  const result = await upsertSurveyAutosaveViaRpc(parsed.data.autosave, parsed.data.language)
  return NextResponse.json(result)
}
