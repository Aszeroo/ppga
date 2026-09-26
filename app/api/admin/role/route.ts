import { NextRequest, NextResponse } from 'next/server'

import {
  changeRoleViaRpc,
  roleChangeFormSchema,
} from '../../../../lib/sup/admin'

/**
 * Ticket #6 role-change: the admin console writes someone else's profile role
 * through the `ppg_change_role` RPC — one call, one profile UPDATE + exactly
 * one audit INSERT, same transaction. The function's gate reads the request's
 * JWT so a learner/teacher smuggle the POST as `permission_denied` (never a
 * silently-0-row UPDATE). The change takes effect immediately for the next
 * request: RLS speaks the profile's role at the request's JWT, not a cache.
 * `force-dynamic` so `next build` never pre-render a POST.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { target_id?: string | null; new_role?: string | null }
  // The console's role-change form posts form-encoded (the native submit); the
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
      new_role: form.get('new_role') as string | null,
    }
  }

  const parsed = roleChangeFormSchema.safeParse({
    target_id: body.target_id ?? undefined,
    new_role: body.new_role ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const result = await changeRoleViaRpc(
    parsed.data.target_id,
    parsed.data.new_role,
  )
  return NextResponse.json(result)
}
