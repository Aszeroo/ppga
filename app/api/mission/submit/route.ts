import { NextRequest, NextResponse } from 'next/server'

import { submitMissionViaRpc } from '../../../../lib/sup/missions'

/**
 * Ticket #11 Knowledge Mission submit: the Learner's retry form posts the
 * `ppg_submit_mission` RPC — the outcome is computed SERVER-side from the
 * answer key at the 70% pass threshold (never client-decided; unlimited
 * retries below the threshold ADD attempt rows; the score history
 * retained). The per-question educational feedback lands in the response
 * (what was right, what was wrong, WHY, what to review — bilingual,
 * actionable). On the FIRST pass the completion hook lands in ONE
 * transaction: the module row UPSERTs to `complete` (the unlock authority
 * the #9/#10 linear rule now reads — module N+1 opens server-side, the
 * client cannot bypass), the +100 XP idempotently (the ledger PK — a
 * replay conflicts, never a second +100; `xp_granted` says what landed),
 * and the Module badge on the completion (the award PK — a duplicate
 * conflicts). The function's gates read the request's JWT so a
 * non-learner smuggle reaches `permission_denied`, an ungated reaches
 * `gate_closed`, a locked/un-passed Mission reaches `mission_not_visible`.
 * `force-dynamic` so `next build` never pre-render a POST.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { module_key?: string | null; answers?: Record<string, string> | null }
  // The console's retry form posts form-encoded (the native submit; the
  // `answer_<order_index>` radios + the `module_key` hidden field); the
  // export UIs may post JSON; both ride the same RPC gate.
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
      module_key: String(form.get('module_key') ?? '') || null,
      answers: Object.fromEntries(
        entries.filter(([k]) => k.startsWith('answer_')),
      ) as Record<string, string> | null,
    }
  }

  const answers = body.answers
    ? Object.fromEntries(
      Object.entries(body.answers!).map(
        ([k, v]) => [String(k).replace(/^answer_/g, ''), v as string] as [string, string],
      ),
    )
    : null

  if (!body.module_key || !answers) {
    return NextResponse.json({
      ok: false,
      detail: `module_key/answer keys missing (the form's module_key + answer_<order_index> fields: ${JSON.stringify({ module_key: body.module_key, answers })})`,
    })
  }

  const result = await submitMissionViaRpc(String(body.module_key), answers as Record<string, string>)
  return NextResponse.json(result)
}
