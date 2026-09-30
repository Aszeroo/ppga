import { NextRequest, NextResponse } from 'next/server'

import {
  posttestFormSchema,
  submitPosttestViaRpc,
} from '../../../../lib/sup/posttest'

/**
 * Ticket #15 Post-Test submit: the Learner's single submit posts the
 * `ppg_posttest_submit` RPC — the score is computed SERVER-side from the
 * answer key (never client-decided), `submitted_at` stamps atomically, same
 * transaction. The function's gate reads the request's JWT: a teacher/admin
 * reaches `permission_denied`; a learner whose Final Project was never
 * ACCEPTED reaches `final_project_not_accepted` (ADR-0002 — never a
 * silently-early instrument); a second submit reaches
 * `already_submitted_or_missing`, never a silent resubmission. NO XP, NO
 * badge rides — a research instrument never rewards (ADR-0001).
 * `force-dynamic` so `next build` never pre-render a POST.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { answers?: Record<string, string> | null; language?: string | null }
  // The console's submit form posts form-encoded (the native submit); JSON
  // may ride the same RPC gate.
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

  const parsed = posttestFormSchema.safeParse({
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

  const result = await submitPosttestViaRpc(parsed.data.answers, parsed.data.language)
  return NextResponse.json(result)
}
