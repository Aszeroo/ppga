import { NextRequest, NextResponse } from 'next/server'

import {
  surveyFormSchema,
  submitSurveyViaRpc,
} from '../../../../lib/sup/survey'

/**
 * Ticket #15 Survey submit: the Learner's single submit posts the
 * `ppg_survey_submit` RPC — `submitted_at` stamps atomically; the answers +
 * the recorded instrument version + language ride the row. The function's
 * gate reads the request's JWT: a teacher/admin reaches `permission_denied`;
 * a learner whose Post-Test was never submitted reaches
 * `posttest_not_submitted` (ADR-0002 — the Survey follows the Post-Test,
 * never earlier); a second submit reaches `already_submitted_or_missing`.
 * NO score, NO XP, NO badge — satisfaction is not an assessment and a
 * research instrument never rewards (ADR-0001). `force-dynamic` so
 * `next build` never pre-render a POST.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { answers?: Record<string, string> | null; language?: string | null }
  if (ct.includes('application/json')) {
    body = await req
      .json()
      .catch(() => ({}) as never)
  } else {
    const form = await req
      .formData()
      .catch(() => new FormData() as never)
    body = {
      answers: Object.fromEntries(
        [...form].filter(([k]) => k.startsWith('item_')),
      ) as Record<string, string> | null,
      language: form.get('language') as string | null,
    }
  }

  const parsed = surveyFormSchema.safeParse({
    answers: body.answers ?? undefined,
    autosave: undefined,
    language: body.language ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const result = await submitSurveyViaRpc(parsed.data.answers, parsed.data.language)
  return NextResponse.json(result)
}
