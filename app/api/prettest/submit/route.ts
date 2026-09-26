import { NextRequest, NextResponse } from 'next/server'

import {
  prettestFormSchema,
  submitViaRpc,
  upsupertAutosaveViaRpc,
} from '../../../../lib/sup/prettest'

/**
 * Ticket #8 submit: the Learner's single submit posts the
 * `ppg_prettest_submit` RPC — the score is computed SERVER-side from the
 * answer key (never client-decided), `submitted_at` stamps atomically,
 * same transaction. The function's gate reads the request's JWT so a
 * teacher/admin/learner-without-consent smuggle the POST as
 * `consent_not_yet` or `permission_denied` (never a silently-overwritten
 * row); a second submit reaches `already_submitted_or_missing`, never a
 * silent resubmission. `force-dynamic` so `next build` never pre-render a
 * POST.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { answers?: Record<string, string> | null }
  // The console's submit form posts form-encoded (the native submit); the
  // later export UIs may post JSON; both ride the same RPC gate.
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
    }
  }

  const parsed = prettestFormSchema.safeParse({
    answers: body.answers ?? undefined,
    autosave: undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const result = await submitViaRpc(parsed.data.answers)
  return NextResponse.json(result)
}
