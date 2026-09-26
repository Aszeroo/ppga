import { NextRequest, NextResponse } from 'next/server'

import { signedUrlForOwnSubmission } from '../../../../lib/sup/submissions'

/**
 * Ticket #13 signed-URL download: the owner's (or a teacher/admin's) own GET rides
 * the `ppg_signed_url_for` RPC — a short-lived (~60s) signed URL the CALLER's uid
 * rides; a stranger's download NEVER reaches the signed URL (the rls policies deny
 * at the row level); a public bucket read NEVER rides (the bucket is private). The
 * redirect to the signed URL rides the response (never a stored public URL).
 * `force-dynamic` so `next build` never pre-render someone else's signed URL.
 */
export const dynamic = 'force-dynamic'

export async function GET(req: NextRequest) {
  const q = new URL(req.url).searchParams
  const moduleKey = q.get('module_key')
  const seqRaw = q.get('submission_seq')
  if (!moduleKey || !seqRaw) {
    return NextResponse.json({
      ok: false,
      detail: `module_key/submission_seq missing (the query's module_key + submission_seq: ${JSON.stringify({ module_key: moduleKey, submission_seq: seqRaw })})`,
    })
  }
  const seq = Number(seqRaw)
  if (!Number.isInteger(seq) || seq < 1 || seq > 2147483647)
    return NextResponse.json({ ok: false, detail: 'submission_seq out of range (1..2147483647)' })

  const result = await signedUrlForOwnSubmission(String(moduleKey), seq)
  if (result.ok && result.url)
    return NextResponse.redirect(result.url)
  return NextResponse.json(result)
}