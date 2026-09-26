import { NextRequest, NextResponse } from 'next/server'

import {
  uuidSchema,
  unlockOverrideViaRpc,
} from '../../../../lib/sup/admin'

import { z } from 'zod'

/**
 * Ticket #8 unlock-override: the admin console unlocks ONE learner past the
 * gate for an exception through the `ppg_prettest_unlock_override` RPC —
 * one call, one profile UPDATE + exactly one audit INSERT (every override
 * is audited, ADR-0002). The function's gate reads the request's JWT so a
 * learner/teacher smuggle the POST as `permission_denied`, never a
 * silently-0-row UPDATE. The gate function speaks the new flag; the
 * learner may now read gated content at the RLS level (the placeholder's
 * own policy). `force-dynamic` so `next build` never pre-render a POST.
 */
export const dynamic = 'force-dynamic'

const overrideFormSchema = z
  .object({
    target_id: uuidSchema,
  })
  .strict()

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { target_id?: string | null }
  // The console's override form posts form-encoded (the native submit); the
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
    }
  }

  const parsed = overrideFormSchema.safeParse({
    target_id: body.target_id ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const result = await unlockOverrideViaRpc(parsed.data.target_id)
  return NextResponse.json(result)
}
