import { NextRequest, NextResponse } from 'next/server'

import { checkSelfCheckViaRpc } from '../../../../lib/sup/xp'

/**
 * Ticket #10 Self-Check submit: the Learner's retry form posts the
 * `ppg_check_self_check` RPC — the outcome is computed SERVER-side from the
 * answer key (never client-decided; unlimited retries ADD event rows), the
 * +50 XP ledger row lands idempotently on the FIRST pass (the PK
 * (learner_id, event_type, event_ref) — a retry/double-click/replay
 * conflicts, never a second +50; the returned `xp_granted` says what
 * actually landed), and the First Steps badge rides the same transaction on
 * the learner's FIRST pass of ANY lesson (the award PK — a duplicate
 * conflicts). The function's gates read the request's JWT so a
 * non-learner smuggle reaches `permission_denied`, an ungated reaches
 * `gate_closed`, a locked/draft/arched lesson reaches
 * `lesson_not_visible` — never a hidden check, never a silently-decided
 * outcome. `force-dynamic` so `next build` never pre-render a POST.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { lesson_key?: string | null; answers?: Record<string, string> | null }
  // The console's retry form posts form-encoded (the native submit; the
  // `answer_<order_index>` radios + the `lesson_key` hidden field); the
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
      lesson_key: String(form.get('lesson_key') ?? '') || null,
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

  if (!body.lesson_key || !answers) {
    return NextResponse.json({
      ok: false,
      detail: `lesson_key/answer keys missing (the form's lesson_key + answer_<order_index> fields: ${JSON.stringify({ lesson_key: body.lesson_key, answers })})`,
    })
  }

  const result = await checkSelfCheckViaRpc(String(body.lesson_key), answers as Record<string, string>)
  return NextResponse.json(result)
}