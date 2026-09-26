import { NextRequest, NextResponse } from 'next/server'

import { createSubmissionViaRpc } from '../../../lib/sup/submissions'

/**
 * Ticket #13 practical submission upload: the learner's upload form posts
 * multipart (the file + the short reflection) here — the magic-byte + the size
 * gate run SERVER-side (never the extension alone; the file signature check is
 * the authority), then the file rides storage.put to the private bucket under the
 * path scheme submissions/{learnerId}/{missionId}/{submissionId} + one row insert
 * (status in_progress). A wrong type / oversize yields the bilingual error detail
 * the form shows; a smuggled row NEVER lands (the rls insert policy denies a
 * stranger's write). The resubmit APPENDS a NEW row under a HIGHER submission_seq
 * (the old row stays as the history). `force-dynamic` so `next build` never
 * pre-render a POST.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const form = await req.formData().catch(() => new FormData() as never)
  const file = form.get('file')
  const reflection = form.get('reflection')
  const moduleKey = form.get('module_key')

  if (!file || !reflection || !moduleKey) {
    return NextResponse.json({
      ok: false,
      detail: `file/reflection/module_key missing (the form's file + reflection + module_key fields: ${JSON.stringify({ module_key: moduleKey, has_file: !!file })})`,
    })
  }

  if (!(file instanceof File))
    return NextResponse.json({ ok: false, detail: 'upload_type_denied: the file field NEVER rides a non-File value' })

  const buf = new Uint8Array(await (file as File).arrayBuffer())
  const result = await createSubmissionViaRpc(
    String(moduleKey),
    buf,
    (file as File).name ?? 'submission.pptx',
    String(reflection),
  )

  return NextResponse.json(result)
}