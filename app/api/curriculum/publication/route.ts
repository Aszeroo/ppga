import { NextRequest, NextResponse } from 'next/server'

import {
  contentKeySchema,
  publicationStateSchema,
  togglePublicationViaRpc,
} from '../../../../lib/sup/curriculum'

import { z } from 'zod'

/**
 * Ticket #9 publication toggle: the admin console toggles a module/lesson's
 * publication state (draft/published/archived) through the
 * `ppg_set_publication` RPC — one call, one module/lesson UPDATE + exactly
 * one audit INSERT, same transaction. The function's gate reads the
 * request's JWT so a learner/teacher smuggle the POST as
 * `permission_denied` (never a silently-0-row UPDATE). The state takes
 * effect immediately for the next request: the visibility policies + the
 * map/lesson RPCs speak at the request's JWT, not a cache. `force-dynamic`
 * so `next build` never pre-render a POST.
 */
export const dynamic = 'force-dynamic'

const publicationFormSchema = z
  .object({
    target_key: contentKeySchema,
    new_state: publicationStateSchema,
  })
  .strict()

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { target_key?: string | null; new_state?: string | null }
  // The console's toggle form posts form-encoded (the native submit); a
  // later bulk UI may post JSON; both ride the same RPC gate.
  if (ct.includes('application/json')) {
    body = await req
      .json()
      .catch(() => ({}) as never)
  } else {
    const form = await req
      .formData()
      .catch(() => new FormData() as never)
    body = {
      target_key: form.get('target_key') as string | null,
      new_state: form.get('new_state') as string | null,
    }
  }

  const parsed = publicationFormSchema.safeParse({
    target_key: body.target_key ?? undefined,
    new_state: body.new_state ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const result = await togglePublicationViaRpc(
    parsed.data.target_key,
    parsed.data.new_state,
  )
  return NextResponse.json(result)
}
