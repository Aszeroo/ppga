import { NextRequest, NextResponse } from 'next/server'

import {
  uuidSchema,
  setConsentViaRpc,
} from '../../../../lib/sup/admin'

import { z } from 'zod'

/**
 * Ticket #8 consent: the admin console sets the paper-consent flag for
 * someone else's profile through the `ppg_set_consent` RPC — one call, one
 * profile UPDATE + exactly one audit INSERT, same transaction. The
 * function's gate reads the request's JWT so a learner/teacher smuggle the
 * POST as `permission_denied` (never a silently-0-row UPDATE). The flag
 * takes effect immediately for the next request: the gate function + the
 * content policy speak at the request's JWT, not a cache. `force-dynamic`
 * so `next build` never pre-render a POST.
 */
export const dynamic = 'force-dynamic'

const consentFormSchema = z
  .object({
    target_id: uuidSchema,
    consent: z.enum(['true', 'false']),
  })
  .strict()

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { target_id?: string | null; consent?: string | null }
  // The console's consent form posts form-encoded (the native submit); the
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
      target_id: form.get('target_id') as string | null,
      consent: form.get('consent') as string | null,
    }
  }

  const parsed = consentFormSchema.safeParse({
    target_id: body.target_id ?? undefined,
    consent: body.consent ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const result = await setConsentViaRpc(
    parsed.data.target_id,
    parsed.data.consent === 'true',
  )
  return NextResponse.json(result)
}
