import { NextRequest, NextResponse } from 'next/server'

import { rejectCrossOrigin } from '../../../../lib/authGuard'
import { chapterTestSubmitSchema, submitChapterTestViaRpc } from '../../../../lib/sup/chapterTest'

/**
 * Ticket #74 submit: the Learner's Chapter pre/post-test posts the
 * `ppg_chapter_test_submit` RPC — the score is computed SERVER-side from the
 * answer key, the attempt is appended, and the best post-test score decides
 * the 70% unlock. The function's own gates reject a teacher/admin/ungated
 * caller and a second pre-test with `gate_closed`/`pre_already_submitted`.
 *
 * The browser form posts form-encoded and is redirected back to the test
 * page on success (the page then renders the persisted score + feedback from
 * the state read). A JSON caller receives the result object.
 */
export const dynamic = 'force-dynamic'

export async function POST(req: NextRequest) {
  // Ticket #63: reject a foreign Origin on every mutating handler.
  const crossOrigin = rejectCrossOrigin(req)
  if (crossOrigin) return crossOrigin

  const ct = req.headers.get('content-type') ?? ''
  const isJson = ct.includes('application/json')
  const form = isJson ? new FormData() : await req.formData().catch(() => new FormData() as never)

  const body = isJson
    ? await req.json().catch(() => ({}) as never)
    : {
        chapter_key: form.get('chapter_key') as string | null,
        phase: form.get('phase') as string | null,
        language: form.get('language') as string | null,
        locale: form.get('locale') as string | null,
        // The form names its radios `item_<order_index>`; the RPC reads the
        // answers by the bare `order_index` key (`p_answers ->> '1'`), so the
        // prefix must come off here (the #18 answer_* lesson).
        answers: Object.fromEntries(
          [...form]
            .filter(([k]) => k.startsWith('item_'))
            .map(([k, v]) => [k.replace(/^item_/, ''), v]),
        ) as Record<string, string>,
      }

  const locale = typeof body.locale === 'string' && body.locale === 'th' ? 'th' : 'en'

  const parsed = chapterTestSubmitSchema.safeParse({
    chapter_key: body.chapter_key ?? undefined,
    phase: body.phase ?? undefined,
    language: body.language ?? undefined,
    answers: body.answers ?? undefined,
  })

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues
        .map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`)
        .join('; '),
    })
  }

  const result = await submitChapterTestViaRpc(
    parsed.data.chapter_key,
    parsed.data.phase,
    parsed.data.answers,
    parsed.data.language,
  )

  if (!isJson && result.ok) {
    // PPGA #99: a RELATIVE Location (a plain 303) keeps the browser on its
    // own origin. `new URL(path, req.url)` used the server's internal host
    // (`localhost:3000`) while the app is normally reached at
    // `127.0.0.1:3000`, so the redirect was cross-origin and the session
    // cookies (set for the caller's origin) never reached the test screen.
    return new NextResponse(null, {
      status: 303,
      headers: {
        Location: `/${locale}/course/${parsed.data.chapter_key}/chapter-test/${parsed.data.phase}`,
      },
    })
  }
  return NextResponse.json(result)
}
