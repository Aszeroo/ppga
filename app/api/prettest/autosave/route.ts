import { NextRequest, NextResponse } from 'next/server'

import {
  prettestFormSchema,
  upsupertAutosaveViaRpc,
} from '../../../../lib/sup/prettest'

/**
 * Ticket #8 autosave: the debounced save posts the `ppg_prettest_upsert`
 * RPC — the function's UPDATE of the CALLER's own response row under their
 * own JWT + RLS (a smuggled autosave value from the browser can never
 * write someone else's row). BEFORE a submit only: a post-submit upsupert
 * reaches `already_submitted`, never a silent overwrite (the immutable
 * trigger compares the row's own `submitted_at` the UPDATE's NEW cannot
 * smuggle away). `force-dynamic` so `next build` never pre-render a POST.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { autosave?: Record<string, unknown> | null }
  if (ct.includes('application/json')) {
    body = await req
      .json()
      .catch(() => ({}) as never)
  } else {
    const form = await req
      .formData()
      .catch(() => new FormData() as never)
    body = {
      autosave: Object.fromEntries([...form]) as Record<string, unknown> | null,
    }
  }

  const parsed = prettestFormSchema.safeParse({
    answers: undefined,
    autosave: body.autosave ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  const result = await upsupertAutosaveViaRpc(parsed.data.autosave)
  return NextResponse.json(result)
}
