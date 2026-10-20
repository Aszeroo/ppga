import 'server-only'

import { createClient, type Session } from '@supabase/supabase-js'
import { NextResponse, type NextRequest } from 'next/server'
import { z } from 'zod'

/**
 * Ticket #3 server-side Auth module: login, logout and change-password all run
 * here. The client-side browser only ever reaches the anon key; the session is
 * carried in an httpOnly cookie (Next cookie jar) so a refresh token never lands
 * in localStorage. Missing environment yields `null` so the pages can show
 * "not-configured" instead of crashing.
 */

/** The login identifier scheme (see migration + README): a synthetic
 * `<handle>@ppga.local` email. Learners use their provisioned student-ID,
 * teachers/admin use `<role>@ppga.local`. We never require a real email. */
const studentIdLoginSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9._-]+$/i)

export const loginFormSchema = z
  .object({
    identifier: studentIdLoginSchema,
    password: z.string().min(8).max(72),
  })
  .strict()

export const changePasswordFormSchema = z
  .object({
    newPassword: z.string().min(8).max(72),
    currentPassword: z.string().min(8).max(72),
  })
  .strict()

export const logoutFormSchema = z.object({ confirm: z.literal(true) }).strict()

export interface AuthResult {
  ok: boolean
  detail?: string
  redirect?: string
}

/** Synthetic email from a login handle — the whole point of the scheme. */
export function syntheticEmail(handle: string): string {
  return `${handle.toLowerCase()}@ppga.local`
}

/** Raw HTTP call the Supabase Auth service expects (PUT /auth/v1/user).
 * PPGA #49 (the owner preview review): `NEXT_PUBLIC_SUP_URL` is the project
 * ROOT (exactly what supabase-js itself is built with — it appends the
 * `/auth/v1` prefix internally), so every raw GoTrue call must name the
 * prefix; and a hosted project speaks through Kong, which rejects any call
 * that omits the `apikey` header (401 before the request ever reaches GoTrue).
 * The anon key is public by design (browser-visible env, README), so
 * attaching it here leaks nothing. */
export async function changePasswordViaSupaHttp(
  accessToken: string,
  newPassword: string,
  currentPassword: string,
): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY
  if (!url) return { ok: false, detail: 'NEXT_PUBLIC_SUP_URL missing' }

  const resp = await fetch(`${url}/auth/v1/user`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      ...(anonKey ? { apikey: anonKey } : {}),
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      password: newPassword,
      // Supabase's Security.UpdatePasswordRequireCurrentPassword gate: when
      // the service demands the old password we send it as `current_password`
      // (400 `current_password_invalid` maps to a UI copy below).
      current_password: currentPassword,
    }),
  })

  if (resp.ok) {
    return { ok: true, detail: 'password updated', redirect: '/profile' }
  }
  const body = await resp.text()
  return { ok: false, detail: `${resp.status} ${body.slice(0, 200)}` }
}

/**
 * Sign-out through the Supabase Auth service — POST /auth/v1/logout with the
 * caller's access token as the Bearer credential (exactly what supabase-js's
 * own signOut speaks; `scope: global` drops the session chain server-side).
 * PPGA #49 (the owner preview review): the call as #3 shipped it rode an
 * unauthenticated, prefixless `/logout` — a hosted project's gateway (no
 * `apikey` header) and GoTrue itself (no Bearer) both refuse that, which is
 * the `logout failing` the owner met: the cookies cleared but the page showed
 * the refusal. A service refusal no longer blocks signing out (the caller
 * still clears every cookie — the observable state is signed-out, the detail
 * reports the service), it just speaks.
 */
export async function signOutViaSupaHttp(accessToken: string): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY
  if (!url) return { ok: false, detail: 'NEXT_PUBLIC_SUP_URL missing' }

  const resp = await fetch(`${url}/auth/v1/logout`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      ...(anonKey ? { apikey: anonKey } : {}),
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({ scope: 'global' }),
  })

  if (resp.ok || resp.status === 204) {
    return { ok: true, detail: 'signed out', redirect: '/' }
  }
  const body = await resp.text()
  return { ok: false, detail: `${resp.status} ${body.slice(0, 200)}` }
}

/**
 * PPGA #49 (session persistence): the stored access JWT lives ~1h while the
 * cookie rides 7 days — with no refresh path every server read after that
 * hour carried an EXPIRED token, the service answered 401, and every read
 * spoke `unauthorized` while the middleware's presence check still called the
 * caller signed-in (a silently rotting session the caller could never
 * observe). The refresh token rides the same stored-session bundle (the login
 * route mirrors it into `ppga_refresh`), and this is the trade the Auth
 * service speaks (`POST /auth/v1/token?grant_type=refresh_token` — the same
 * GoTrue REST the two helpers above already use).
 *
 * The failure speaks two ways: INVALIDATED (GoTrue itself refused the token —
 * a dead session the caller must lose) versus TRANSIENT (unreachable /
 * misconfigured / 5xx / a body that is not a session — the caller keeps what
 * it has; the next request tries again). And because GoTrue rotates a refresh
 * token on use, two parallel trades of the SAME token would collide (the
 * loser reads the winner's trade as invalid): the in-flight map single-flights
 * each token per server process, so a page load firing several RSC requests
 * behind one stale cookie makes exactly ONE trade and every waiter rides it.
 */
export interface SessionRefreshResult extends AuthResult {
  session?: Session
  /** The refusal is not the token's fault — leave the stored session alone. */
  transient?: boolean
  /** GoTrue refused THIS token (invalid_grant/401/403) — the session is dead. */
  invalidated?: boolean
}

const refreshInFlight = new Map<string, Promise<SessionRefreshResult>>()

export function refreshSessionViaSupaHttp(refreshToken: string): Promise<SessionRefreshResult> {
  const existing = refreshInFlight.get(refreshToken)
  if (existing) return existing
  const attempt = doRefreshSessionViaSupaHttp(refreshToken).finally(() => {
    refreshInFlight.delete(refreshToken)
  })
  refreshInFlight.set(refreshToken, attempt)
  return attempt
}

async function doRefreshSessionViaSupaHttp(refreshToken: string): Promise<SessionRefreshResult> {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY
  if (!url) return { ok: false, transient: true, detail: 'NEXT_PUBLIC_SUP_URL missing' }

  let resp: Response
  try {
    resp = await fetch(`${url}/auth/v1/token?grant_type=refresh_token`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(anonKey ? { apikey: anonKey, Authorization: `Bearer ${anonKey}` } : {}),
      },
      body: JSON.stringify({ refresh_token: refreshToken }),
    })
  } catch (e) {
    return { ok: false, transient: true, detail: `network: ${e instanceof Error ? e.message : 'unreachable'}` }
  }

  if (!resp.ok) {
    const body = await resp.text()
    // invalid_grant / a refused signature window — these statuses speak for
    // the TOKEN, not the transport. Everything else (429/5xx) is transient.
    const invalidated = resp.status === 400 || resp.status === 401 || resp.status === 403
    return {
      ok: false,
      ...(invalidated ? { invalidated: true } : { transient: true }),
      detail: `${resp.status} ${body.slice(0, 200)}`,
    }
  }
  const session = (await resp.json().catch(() => null)) as Session | null
  if (!session || typeof session.access_token !== 'string' || typeof session.refresh_token !== 'string') {
    return { ok: false, transient: true, detail: 'refresh response carried no session' }
  }
  return { ok: true, detail: 'session refreshed', session }
}

/** The stored-bundle facts a refresh decision needs: the access JWT, the
 * refresh token to trade, and when the access token dies (bundle
 * `expires_at`, falling back to the JWT's own `exp`). `null` = unreadable
 * garbage (the read then fails exactly as it did before this guard existed). */
interface StoredSessionBits {
  accessToken: string | null
  refreshToken: string | null
  expiresAt: number | null
}

function readStoredSessionBits(cookie: string | undefined): StoredSessionBits | null {
  if (!cookie) return null
  if (!cookie.startsWith('{')) {
    // The pre-#4 raw-JWT form: fresh-checkable, but it carries no refresh
    // token — the guard leaves it alone (nothing to trade).
    return { accessToken: cookie, refreshToken: null, expiresAt: jwtExp(cookie) }
  }
  try {
    const raw = JSON.parse(cookie) as { access_token?: unknown; refresh_token?: unknown; expires_at?: unknown }
    const accessToken = typeof raw.access_token === 'string' ? raw.access_token : null
    return {
      accessToken,
      refreshToken: typeof raw.refresh_token === 'string' ? raw.refresh_token : null,
      expiresAt:
        typeof raw.expires_at === 'number' ? raw.expires_at : accessToken ? jwtExp(accessToken) : null,
    }
  } catch {
    return null
  }
}

/** The raw access JWT's `exp` claim (epoch seconds), or `null`. Freshness
 * only, ever: NO signature verification — the DATABASE's RLS + the gate
 * functions still decide every row against the request's own verified claims. */
function jwtExp(token: string): number | null {
  const payload = token.split('.').at(1)
  if (!payload) return null
  try {
    const base64 =
      payload.replaceAll('-', '+').replaceAll('_', '/') + '='.repeat((4 - (payload.length % 4)) % 4)
    const claims = JSON.parse(Buffer.from(base64, 'base64').toString('utf8')) as { exp?: unknown }
    return typeof claims.exp === 'number' ? claims.exp : null
  } catch {
    return null
  }
}

/** The `ppga_session` cookie's stored value — the exact envelope shape the
 * login route writes (supabase-js's session JSON under `current_version`,
 * with `expires_at` filled so the freshness read never re-derives it). */
function sessionBundleJson(session: Session): string {
  const withExpiry = {
    ...session,
    expires_at: session.expires_at ?? Math.floor(Date.now() / 1000) + (session.expires_in ?? 3600),
  }
  return JSON.stringify({ current_version: '1', ...withExpiry })
}

export type StaleSessionOutcome =
  | null // fresh / nothing to trade — leave the session alone
  | 'transient' // the trade could not be REACHED — leave it alone too
  | 'invalidated' // GoTrue refused the token — the session is DEAD
  | { bundle: string; refreshToken: string } // rotated: persist + serve this

/**
 * PPGA #49 (session persistence): the ONE freshness decision every read path
 * consults — the middleware (for the page/RSC renders it can persist onto
 * its own response) and the route-handler guard below. A stale-but-tradable
 * bundle returns the rotated envelope; nothing here WRITES the rotation (each
 * caller carries it wherever it can: the middleware onto the response cookie,
 * the guard through the storage adapter) and a transient failure never burns
 * the caller's existing state.
 */
export async function refreshStaleSession(req: NextRequest): Promise<StaleSessionOutcome> {
  const bits = readStoredSessionBits(req.cookies.get('ppga_session')?.value)
  if (!bits || bits.expiresAt == null) return null
  // 60s of clock-skew grace: a token about to die mid-request is still good.
  if (bits.expiresAt > Math.floor(Date.now() / 1000) + 60) return null
  const refreshToken = bits.refreshToken ?? req.cookies.get('ppga_refresh')?.value ?? null
  if (!refreshToken) return null

  const refreshed = await refreshSessionViaSupaHttp(refreshToken)
  if (refreshed.ok && refreshed.session) {
    return { bundle: sessionBundleJson(refreshed.session), refreshToken: refreshed.session.refresh_token }
  }
  return refreshed.invalidated ? 'invalidated' : 'transient'
}

/**
 * PPGA #49 (session persistence): the session READ path's freshness guard,
 * run BEFORE a route-scoped client ever reads with the bundle. An expired
 * stored bundle is traded for a fresh one at the Auth service and ROTATED
 * back through the SAME storage helper the login route writes through (which
 * carries `ppga_session` + `ppga_refresh` onto the bound response when a
 * response object exists); a refresh the service REFUSES for the token
 * itself CLEARS both (the caller reads as logged out — the safe default,
 * never a half-live session), while a refresh that could not be REACHED
 * leaves the bundle untouched (the read then speaks exactly as it did before
 * this guard existed, and no network wobble can kill a live session). An
 * unknown expiry or a bundle with no refresh token is likewise untouched.
 */
export async function ensureFreshSession(
  req: NextRequest,
  storage: ReturnType<typeof nextStorage>,
): Promise<void> {
  const outcome = await refreshStaleSession(req)
  if (!outcome || outcome === 'transient') return
  if (outcome === 'invalidated') {
    // The same clear the logout route carries (the storage's own removeItem —
    // overlay + bound response cookie).
    storage.removeItem('ppga_session')
    storage.removeItem('ppga_refresh')
    return
  }
  // The rotated bundle rides the exact shape the login route writes, and
  // `ppga_refresh` follows the rotated refresh token (GoTrue rotation: the
  // traded token is spent on use).
  storage.setItem('ppga_session', outcome.bundle)
  storage.setItem('ppga_refresh', outcome.refreshToken)
}

/**
 * PPGA #49 (session persistence): a scratch response for route handlers that
 * build their own `NextResponse` only AFTER the client has read. Bind `.res`
 * to `createSupaSessionClientForRoute` and the freshness guard (plus every
 * supabase-js storage write) lands on it; `mergeInto` copies the two session
 * cookies onto the response the route actually returns — otherwise a rotation
 * would live only in the request's overlay, the spent refresh token would
 * burn again on the caller's NEXT request, and the session would die exactly
 * the hour the ticket set out to save.
 */
export function newSessionCookieJar() {
  const res = NextResponse.json(null)
  return {
    res,
    /** Copies ONLY the two session cookies — the route owns every other flag. */
    mergeInto(target: NextResponse) {
      for (const cookie of res.cookies.getAll()) {
        if (cookie.name !== 'ppga_session' && cookie.name !== 'ppga_refresh') continue
        target.cookies.set(cookie.name, cookie.value, {
          path: cookie.path,
          httpOnly: cookie.httpOnly,
          secure: cookie.secure,
          sameSite: cookie.sameSite,
          maxAge: cookie.maxAge,
        })
      }
    },
  }
}

/**
 * Supa-js `storage` written against the Next cookie jar (supa-v2 no longer
 * ships `cookieAdapter` — the session bundle is read/written through `storage`).
 * The tokens live in an httpOnly, SameSite=lax cookie on `/` so a learner's
 * refresh token never lands in localStorage, and the session is restored
 * server-side before any role-gated page is rendered.
 *
 * PPGA #18 (live journey, the consent-redirect finding): the adapter also
 * carries an IN-REQUEST overlay. A session issued DURING the request (the
 * login route's own `signInWithPassword`) must be readable by the later reads
 * on the SAME client — supabase-js reads a server storage back on every token
 * use, and a request whose incoming cookies predate the login would otherwise
 * hand it `null`, running the login route's OWN gate read UNAUTHENTICATED
 * (every re-login then read `consent = false` and bounced the learner off the
 * Pre-Test). The overlay never widens any authority: every read it enables
 * still rides the CALLER's own JWT through the very same RLS the browser's
 * next request will hit; the durable copy of the session still lands in the
 * httpOnly cookie the login route sets.
 */
function nextStorage(req: NextRequest, res?: NextResponse) {
  const overlay = new Map<string, string>()
  return {
    isServer: true as const,
    getItem(key: string) {
      return overlay.get(key) ?? req.cookies.get(key)?.value ?? null
    },
    setItem(key: string, value: string) {
      overlay.set(key, value)
      res?.cookies.set(key, value, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      })
    },
    removeItem(key: string) {
      // An EMPTY-string tombstone (not a delete): the guard's cleared session
      // must read as NO session even while the stale incoming cookie is still
      // in the jar (supabase-js treats an empty bundle as signed-out).
      overlay.set(key, '')
      res?.cookies.set(key, '', { path: '/', maxAge: 0 })
    },
  }
}

/** Route-scoped session client (cookies read from the request, written to the
 * response). Missing env => `null` so the UI can show not-configured.
 *
 * PPGA #49 (session persistence): built only AFTER the bundle's freshness
 * guard has spoken — an expired access token is refreshed (and the rotated
 * bundle carried onto the bound response, or the in-request overlay when no
 * response is bound yet) before the caller's first read, and a refused
 * refresh reads as logged out. Hence `async`. */
export async function createSupaSessionClientForRoute(req: NextRequest, res?: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY

  if (!url || !anonKey) return null

  const storage = nextStorage(req, res)
  await ensureFreshSession(req, storage)

  return createClient(url, anonKey, {
    auth: {
      storageKey: 'ppga_session',
      // PPGA #49: the guard above (and the middleware ahead of it) owns ALL
      // refreshing. supabase-js's own auto-refresh would trade the SAME
      // rotation token the guard cannot observe — and it can never persist
      // the trade from server storage anyway (the browser would keep a token
      // the service already spent). False keeps the one refresher honest.
      autoRefreshToken: false,
      storage,
    },
  })
}
