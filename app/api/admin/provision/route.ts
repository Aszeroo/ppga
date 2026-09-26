import { NextRequest, NextResponse } from 'next/server'

import {
  existingHandles,
  genTempPassword,
  parseRoster,
  provisionGate,
  provisionFinalizeViaRpc,
  createUserViaAdminApi,
  provisionLineSchema,
  type ProvisionState,
} from '../../../../lib/sup/provision'

/**
 * Ticket #7 provisioning route: a pasted roster (one learner per line:
 * student ID + name) or a single-add form. The lines that survive validation
 * create real accounts through the Supabase Auth ADMIN API (`createUser`) —
 * the ONE legitimate service-role use, server-side only (see lib/sup/provision
 * 's header) — with a synthetic email (the #3 handle scheme) and a one-time
 * temp password. Every line (created/duplicate/malformed) then rides the
 * `ppg_provision_finalize` RPC under the CALLER's JWT — Teacher/Admin provision
 * (#7's story); a learner smuggles the POST as `permission_denied` (the gate
 * above denies BEFORE any create, so no account is ever half-made by a
 * learner's smuggle), never a silently-0-row audit.
 *
 * `force-dive` so `next build` never pre-render this POST. The response carries
 * the printable bilingual handout list (student ID + the one-time temp password
 * per created line) + the per-line results report (`created|duplicate|
 * malformed`) — the passwords ride the response body (the UI's handout) only,
 * never the audit stream.
 */
export const dynamic = 'force-dynamic'

// fallow-ignore-next-line complexity
export async function POST(req: NextRequest) {
  const ct = req.headers.get('content-type') ?? ''
  let body: { roster?: string; student_id?: string; full_name?: string }
  if (ct.includes('application/json')) {
    body = await req.json().catch(() => ({}) as never)
  } else {
    const form = await req.formData().catch(() => new FormData() as never)
    body = {
      roster: (form.get('roster') as string | null) ?? undefined,
      student_id: (form.get('student_id') as string | null) ?? undefined,
      full_name: (form.get('full_name') as string | null) ?? undefined,
    }
  }

  // The two entry points ride one route: a roster paste (`{ roster: "..." }`)
  // and a single-add form (`{ student_id, full_name }` — the native submit's
  // form-encoded). An empty paste is an `empty` observable state, never a
  // crash.
  const rosterText = body.roster
  const singleId = body.student_id
  const singleName = body.full_name

  if (!rosterText && (!singleId || !singleName)) {
    return NextResponse.json({
      status: 'error',
      detail: 'a roster paste or a single-add (student_id + full_name) is required',
    })
  }

  const gate = await provisionGate()
  if (gate.kind === 'not-configured' || gate.kind === 'unauthorized' || gate.kind === 'denied') {
    // The denial outcomes are observable states the page renders — not a blank
    // screen — and NO create, NO audit write ever happen for a denied/unauth
    // caller (the gate speaks BEFORE any account is half-made by a learner's
    // smuggle).
    return NextResponse.json({
      status: gate.kind,
      detail: gate.kind === 'denied' ? 'provisioning is admin/teacher-only (the JWT role claim decides)' : gate.kind === 'unauthorized' ? 'no session' : 'NEXT_PUBLIC_SUP_* / SUP_SERVICE_ROLE_KEY missing',
    } as ProvisionState)
  }
  // The gate above speaks admin OR teacher only (`ok`) — the provision path
  // runs on the same authority as the finalize RPC's own gate.

  const existing = new Set(await existingHandles())
  const lines = rosterText
    ? parseRoster(rosterText)
    : (() => {
      const id = (singleId ?? '').toLowerCase()
      const name = singleName ?? ''
      const parsed = provisionLineSchema.safeParse({
        student_id: id,
        full_name: name,
      })
      return parsed.success
        ? [{ student_id: parsed.data.student_id, full_name: parsed.data.full_name, result: 'created' as const }]
        : [{ student_id: id, full_name: name || id, result: 'malformed' as const }]
    })()

  // The duplicate check against EXISTING accounts: a handle that already has a
  // profile row (the teacher/admin's RLS-filtered read above) is a `duplicate`
  // line — the line is rejected, no create, no audit-write for the created
  // side, the audit still records the rejected line's result.
  const results: ProvisionState['lines'] = []
  for (const line of lines) {
    const isDuplicateAgainst = line.result !== 'malformed' && existing.has(line.student_id)
    const verdict = line.result === 'malformed' ? 'malformed' : isDuplicateAgainst ? 'duplicate' : line.result

    if (verdict === 'malformed' || verdict === 'duplicate') {
      // Rejected line: no create. The audit write still happens (the report
      // stream proves every attempt) — the finalize RPC's null-target UPDATE is
      // a harmless 0-row UPDATE (no target given; gotrue never created anyone).
      const audit = await provisionFinalizeViaRpc(null, line.student_id, line.full_name, verdict)
      results.push({
        student_id: line.student_id,
        full_name: line.full_name,
        result: verdict as 'malformed' | 'duplicate',
      })
      continue
    }

    const temp = genTempPassword()
    const created = await createUserViaAdminApi(line.student_id, line.full_name, temp)
    if (!created.ok) {
      results.push({ student_id: line.student_id, full_name: line.full_name, result: 'malformed' })
      continue
    }

    const finalize = await provisionFinalizeViaRpc(
      created.id ?? null,
      line.student_id,
      line.full_name,
      'created',
    )
    results.push({
      student_id: line.student_id,
      full_name: line.full_name,
      result: finalize.ok ? 'created' : 'malformed',
      // The handout: the one-time temp password is printed here — the same
      // string the account carries — so the teacher can hand it out on paper.
      temp_password: finalize.ok ? temp : undefined,
    })
  }

  const hasAny = results.length > 0
  return NextResponse.json({
    status: hasAny ? 'ok' : 'empty',
    detail: hasAny ? `${results.length} lines processed` : 'no lines on the paste',
    lines: results,
  } as ProvisionState)
}
