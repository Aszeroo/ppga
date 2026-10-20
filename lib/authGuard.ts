import 'server-only'

import { NextRequest, NextResponse } from 'next/server'

import {
  buildAuthAuditRow,
  shouldAuditThrottle,
  type AuthAuditAction,
  type AuthAuditDetails,
  normalizeHandle,
} from './authAudit'
import { createRateLimiter, firstLimited, type RateLimiter } from './rateLimit'
import { isRequestOriginAllowed, parseAllowedOrigins } from './requestOrigin'
import { createSupabaseServerClient } from './sup/server'

/**
 * Ticket #63: route-facing guard helpers. Three small units:
 *
 * 1. `rejectCrossOrigin` — the consistent Origin gate every mutating route
 *    handler calls first (the pure decision table lives in
 *    `lib/requestOrigin.ts`).
 * 2. The auth limiter pair — per-handle and per-IP fixed windows (the pure
 *    limiter lives in `lib/rateLimit.ts`). Limits are env-configurable; see
 *    `.env.example`.
 * 3. `auditAuthEvent` — failed-login/throttle rows in `ppg_audit_events`
 *    through the service-role client (the caller is unauthenticated, so the
 *    caller's JWT cannot write). Details carry non-reversible hashes and a
 *    coarse handle kind — never the identifier, password, or token. An audit
 *    failure is swallowed: it must never change the auth response.
 */

interface AuthLimitConfig {
  handleMaxAttempts: number
  ipMaxAttempts: number
  windowSeconds: number
}

const AUTH_LIMIT_DEFAULTS: Readonly<AuthLimitConfig> = {
  handleMaxAttempts: 5,
  ipMaxAttempts: 50,
  windowSeconds: 900,
}

const positiveInt = (value: string | undefined, fallback: number): number => {
  if (!value) return fallback
  const parsed = Number.parseInt(value, 10)
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback
}

/** Read the limits from the environment; safe defaults when absent/invalid. */
function readAuthLimits(env: NodeJS.ProcessEnv = process.env): AuthLimitConfig {
  return {
    handleMaxAttempts: positiveInt(env.PPGA_AUTH_HANDLE_MAX_ATTEMPTS, AUTH_LIMIT_DEFAULTS.handleMaxAttempts),
    ipMaxAttempts: positiveInt(env.PPGA_AUTH_IP_MAX_ATTEMPTS, AUTH_LIMIT_DEFAULTS.ipMaxAttempts),
    windowSeconds: positiveInt(env.PPGA_AUTH_WINDOW_SECONDS, AUTH_LIMIT_DEFAULTS.windowSeconds),
  }
}

export interface AuthLimiters {
  handle: RateLimiter
  ip: RateLimiter
}

const limitersByScope = new Map<string, AuthLimiters>()

/**
 * One handle limiter + one IP limiter per auth scope. Module state is
 * per-instance only (documented in `.env.example`); a shared store can be
 * injected into `createRateLimiter` later without touching call sites.
 */
export function getAuthLimiters(scope: 'login' | 'change-password'): AuthLimiters {
  const existing = limitersByScope.get(scope)
  if (existing) return existing
  const config = readAuthLimits()
  const pair: AuthLimiters = {
    handle: createRateLimiter({ maxAttempts: config.handleMaxAttempts, windowSeconds: config.windowSeconds }),
    ip: createRateLimiter({ maxAttempts: config.ipMaxAttempts, windowSeconds: config.windowSeconds }),
  }
  limitersByScope.set(scope, pair)
  return pair
}

/** Re-exported for route handlers. */
export { firstLimited, shouldAuditThrottle, normalizeHandle }

/** First hop of `x-forwarded-for` (Vercel/proxy), else `x-real-ip`. */
export function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
  if (forwarded) return forwarded
  const real = req.headers.get('x-real-ip')?.trim()
  if (real) return real
  // Conservative fallback: one shared bucket rather than trusting a
  // caller-supplied value. It still throttles, just less precisely.
  return 'unknown'
}

/**
 * Consistent Origin gate for every mutating route. Returns the 403 response
 * when the request is foreign, or `null` when it may proceed.
 */
export function rejectCrossOrigin(req: NextRequest): NextResponse | null {
  const info = {
    origin: req.headers.get('origin'),
    referer: req.headers.get('referer'),
    secFetchSite: req.headers.get('sec-fetch-site'),
    host: req.headers.get('host'),
    forwardedHost: req.headers.get('x-forwarded-host'),
    forwardedProto: req.headers.get('x-forwarded-proto'),
    url: req.url,
  }
  const allowlist = parseAllowedOrigins(process.env.PPGA_ALLOWED_ORIGINS)
  if (isRequestOriginAllowed(info, allowlist)) return null
  return NextResponse.json({ ok: false, detail: 'origin_not_allowed' }, { status: 403 })
}

/** The single 429 shape; identical for existing and non-existing handles. */
export function throttledResponse(retryAfterSeconds: number): NextResponse {
  return NextResponse.json(
    { ok: false, detail: 'too many attempts; try again later' },
    { status: 429, headers: { 'Retry-After': String(Math.max(1, Math.ceil(retryAfterSeconds))) } },
  )
}

export type { AuthAuditAction, AuthAuditDetails } from './authAudit'

/**
 * Append an auth event to `ppg_audit_events` with the service-role client.
 * Never throws and never blocks the response on failure.
 */
export async function auditAuthEvent(
  action: AuthAuditAction,
  req: NextRequest,
  details: AuthAuditDetails = {},
): Promise<void> {
  try {
    const sup = createSupabaseServerClient()
    if (!sup) return

    await sup.from('ppg_audit_events').insert(buildAuthAuditRow(action, details, getClientIp(req)))
  } catch {
    // Ticket #63: the audit stream is best-effort; an insert failure must
    // never break (or change the shape of) the auth response.
  }
}
