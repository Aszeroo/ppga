import { NextRequest, NextResponse } from 'next/server'

import {
  auditAuthEvent,
  firstLimited,
  getAuthLimiters,
  getClientIp,
  rejectCrossOrigin,
  shouldAuditThrottle,
  throttledResponse,
} from '../../../../lib/authGuard'
import {
  changePasswordViaSupaHttp,
  changePasswordFormSchema,
  createSupaSessionClientForRoute,
  newSessionCookieJar,
} from '../../../../lib/sup/auth'

/**
 * Ticket #3 change-password: a signed-in user swaps their password at the
 * Supabase Auth service via PUT /auth/user. The form is Zod-valid before we
 * touch Auth; a weak-password/reauthentication/same-password gate maps to
 * observable state (the response carries the service's message verbatim).
 *
 * `force-dynamic` so `next build` never pre-render this POST — the endpoint is
 * only real once a live Supabase Auth is configured.
 */
export const dynamic = 'force-dynamic'

// fallow-ignore-next-line complexity
export async function POST(req: NextRequest) {
  // Ticket #63: the consistent Origin gate every mutating route carries.
  const crossOrigin = rejectCrossOrigin(req)
  if (crossOrigin) return crossOrigin

  const parsed = changePasswordFormSchema.safeParse(
    await req
      .json()
      .catch(() => ({}) as never), // malformed body => `{}` fails the Zod check below
  )

  if (!parsed.success) {
    return NextResponse.json({
      ok: false,
      detail: parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join('; '),
    })
  }

  // Ticket #63: per-IP AND per-account fixed windows. The account key is read
  // from the caller's own session below (a handle-equivalent that never
  // reveals whether the password matched). The IP window is checked before
  // the session read so a throttled caller costs no Auth traffic.
  const limits = getAuthLimiters('change-password')
  const ipKey = `ip:${getClientIp(req)}`
  const blockedIp = limits.ip.check(ipKey)
  if (blockedIp.limited) {
    const auditKey = `change-password:ip:${ipKey}`
    if (shouldAuditThrottle(auditKey, limits.ip.windowSeconds)) {
      await auditAuthEvent('change_password_throttled', req, {
        reason: 'ip',
        retryAfterSeconds: blockedIp.retryAfterSeconds,
      })
    }
    return throttledResponse(blockedIp.retryAfterSeconds)
  }

  // PPGA #49: the factory's freshness guard MAY rotate a stale bundle before
  // this route reads — the jar captures that rotation (or a refusal's clear)
  // and merges onto every response below so the caller's NEXT request rides
  // the traded token instead of burning it a second time.
  const cookieJar = newSessionCookieJar()
  const sup = await createSupaSessionClientForRoute(req, cookieJar.res)
  if (!sup) return NextResponse.json({ ok: false, detail: 'not-configured' })

  const { data: session } = await sup.auth.getSession()
  if (!session || !session.session) {
    const res = NextResponse.json({ ok: false, detail: 'no session' })
    cookieJar.mergeInto(res)
    return res
  }

  const userKey = `user:${session.session.user.id}`
  const blockedUser = limits.handle.check(userKey)
  if (blockedUser.limited) {
    const auditKey = `change-password:account:${userKey}`
    if (shouldAuditThrottle(auditKey, limits.handle.windowSeconds)) {
      await auditAuthEvent('change_password_throttled', req, {
        reason: 'account',
        retryAfterSeconds: blockedUser.retryAfterSeconds,
      })
    }
    const throttled = throttledResponse(blockedUser.retryAfterSeconds)
    cookieJar.mergeInto(throttled)
    return throttled
  }

  const viaHttp = await changePasswordViaSupaHttp(
    session.session.access_token,
    parsed.data.newPassword,
    parsed.data.currentPassword,
  )

  if (!viaHttp.ok) {
    // Ticket #63: count the failed swap and emit the audit signal.
    const userState = limits.handle.recordFailure(userKey)
    const ipState = limits.ip.recordFailure(ipKey)
    await auditAuthEvent('change_password_failed', req, { reason: 'invalid_credentials' })
    const crossed = firstLimited([
      { scope: 'account', state: userState },
      { scope: 'ip', state: ipState },
    ])
    if (crossed) {
      const auditKey = `change-password:${crossed.scope}:${crossed.scope === 'ip' ? ipKey : userKey}`
      if (shouldAuditThrottle(auditKey, limits.handle.windowSeconds)) {
        await auditAuthEvent('change_password_throttled', req, {
          reason: crossed.scope,
          retryAfterSeconds: crossed.state.retryAfterSeconds,
        })
      }
      const throttled = throttledResponse(crossed.state.retryAfterSeconds)
      cookieJar.mergeInto(throttled)
      return throttled
    }
  } else {
    // Ticket #63: a successful swap clears the account + IP windows.
    limits.handle.reset(userKey)
    limits.ip.reset(ipKey)
  }

  // Ticket #7 first-login force-change completion: the Auth service's PUT
  // landed the new password (the temp password is now spent — one-time by
  // construction), so the DATABASE's flag may clear too — the CALLER's own
  // JWT + the profiles' UPDATE policy (own-row) speaks the write (a
  // service-side smuggle can never clear someone else's flag; a denied read
  // is a 0-row UPDATE by the table itself, observable as `false` below). The
  // httpOnly flag cookie is cleared on the same success path so the
  // middleware's redirect can speak `/profile` verbatim from now on.
  const res = NextResponse.json(viaHttp)
  cookieJar.mergeInto(res)
  if (viaHttp.ok) {
    const { error: clearError } = await sup
      .from('ppg_profiles')
      .update({ must_change_password: false })
      // The caller's own row only: an admin/teacher may UPDATE EVERY profile
      // row under their SELECT/UPDATE policy (#3's admin-write-all + the
      // teacher's own-row), so an unfiltered UPDATE here would clear the
      // one-time-flag on every provisioned learner still awaiting their
      // first-login change. The filter narrows to `id = auth.uid()`.
      .eq('id', session.session.user.id)
    // A clear-read failure (RLS deny / a PostgREST error) never reverses the
    // PUT's success (the password IS the new one now) — the flag waits for the
    // next attempt; the next login's flag read below re-sends the redirect.
    // The cookie is cleared either way (the flag's `true` value is spent
    // regardless; the middleware re-reads the DATABASE on the next login).
    res.cookies.set('ppga_must_change_password', '', { path: '/', maxAge: 0 })
    if (clearError) {
      // The observable note only lands in `detail`'s body (the DATABASE read
      // failed — the next login's flag read below speaks the redirect again),
      // never a blank screen. PPGA #49: this replaces `res`, so the guard's
      // session rotation has to ride the new response too.
      const flagRes = NextResponse.json({ ...viaHttp, detail: `${viaHttp.detail}; flag read: ${clearError.message}` })
      cookieJar.mergeInto(flagRes)
      return flagRes
    }
  }
  return res
}
