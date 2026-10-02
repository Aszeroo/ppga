import { NextRequest, NextResponse } from 'next/server'

import { submitForReviewViaRpc } from '../../../../lib/sup/submissions'

/**
 * PPGA #18 (production verification, finding #2): the learner's `in_progress ->
 * submitted` move — the ONE missing wire between #13's upload (creates
 * `in_progress`) and #14's review queue (reads `submitted` ONLY). A form-encoded
 * native POST from the practical screen's history row (the JSON body is
 * accepted the same way); the caller's own uid rides the SESSION, never the
 * body. The `ppg_set_submission_status` gate is the sole authority: a stranger's
 * round reaches `denied_caller`, a teacher/admin smuggle `denied_role`, an
 * already-reviewed round `invalid_transition` — the raised error rides out
 * verbatim, never a silently-0-row move. Field shape (module key, positive
 * integer round) is validated in `submitForReviewViaRpc` — the single authority
 * every caller passes through.
 */
export const dynamic = 'force-dynamic'

async function readFields(req: NextRequest): Promise<{ moduleKey: string; seq: unknown }> {
  if (req.headers.get('content-type')?.includes('application/json')) {
    const body = await req.json().catch(() => ({}) as never) as Record<string, unknown>
    return { moduleKey: String(body.module_key ?? ''), seq: body.submission_seq }
  }
  const form = await req.formData().catch(() => new FormData() as never)
  return { moduleKey: String(form.get('module_key') ?? ''), seq: form.get('submission_seq') }
}

export async function POST(req: NextRequest) {
  const { moduleKey, seq } = await readFields(req)
  const result = await submitForReviewViaRpc(moduleKey, Number(seq))
  return NextResponse.json(result)
}
