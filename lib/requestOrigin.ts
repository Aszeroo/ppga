/**
 * Ticket #63: request-origin evaluation for mutating API routes.
 *
 * This module is pure (no Next.js, no `server-only`) so the decision table is
 * unit-testable. `lib/authGuard.ts` wraps it in a `NextResponse`.
 *
 * Policy:
 * - An explicit `Origin` that is not allowed is rejected.
 * - No `Origin` is allowed only when the browser did not signal a cross-site
 *   request. Browsers send `Sec-Fetch-Site` on mutating requests; a
 *   `cross-site`/`same-site` value with no `Origin` is rejected.
 * - A `Referer` (when present and no `Origin`) must also name an allowed
 *   origin.
 * - Non-browser clients that send neither header (curl, server-to-server,
 *   same-origin navigations without `Origin`) keep working.
 *
 * Allowed origins come from `PPGA_ALLOWED_ORIGINS` (comma-separated absolute
 * origins) when configured. Otherwise they are derived from the request's own
 * host/proto (`x-forwarded-host`/`x-forwarded-proto`, falling back to `Host`
 * and the request URL), which keeps Vercel preview deployments working
 * without pinning every preview hostname in an env var.
 */

export interface OriginRequestInfo {
  origin?: string | null
  referer?: string | null
  secFetchSite?: string | null
  host?: string | null
  forwardedHost?: string | null
  forwardedProto?: string | null
  /** The absolute request URL. */
  url: string
}

const firstHeaderValue = (value: string | null | undefined): string | null => {
  if (!value) return null
  const first = value.split(',')[0]?.trim()
  return first ? first : null
}

/** Normalize an absolute URL/origin to `scheme://host[:port]`, or null. */
export function normalizeOrigin(value: string | null | undefined): string | null {
  if (!value) return null
  try {
    const parsed = new URL(value)
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return null
    return parsed.origin
  } catch {
    return null
  }
}

/** Parse the `PPGA_ALLOWED_ORIGINS` allowlist (comma-separated). */
export function parseAllowedOrigins(value: string | null | undefined): string[] {
  if (!value) return []
  const origins = value
    .split(',')
    .map((entry) => normalizeOrigin(entry.trim()))
    .filter((entry): entry is string => entry !== null)
  return [...new Set(origins)]
}

function requestOwnOrigin(info: OriginRequestInfo): string | null {
  let urlOrigin: string | null = null
  try {
    urlOrigin = new URL(info.url).origin
  } catch {
    urlOrigin = null
  }

  const proto = firstHeaderValue(info.forwardedProto) ?? normalizeOrigin(urlOrigin)?.split(':')[0] ?? null
  const host = firstHeaderValue(info.forwardedHost) ?? firstHeaderValue(info.host)
  if (host) {
    const scheme = proto === 'http' || proto === 'https' ? proto : 'https'
    const normalized = normalizeOrigin(`${scheme}://${host}`)
    if (normalized) return normalized
  }
  return normalizeOrigin(urlOrigin)
}

/**
 * The allowed origin set for this request: the explicit allowlist when set,
 * otherwise the deployment origin derived from the request itself.
 */
function allowedOriginsForRequest(
  info: OriginRequestInfo,
  allowlist: string[] = [],
): string[] {
  if (allowlist.length > 0) return allowlist
  const own = requestOwnOrigin(info)
  return own ? [own] : []
}

/** True when the mutating request is same-origin (or a non-browser client). */
export function isRequestOriginAllowed(
  info: OriginRequestInfo,
  allowlist: string[] = [],
): boolean {
  const allowed = allowedOriginsForRequest(info, allowlist)

  if (info.origin != null && info.origin !== '') {
    const origin = normalizeOrigin(info.origin)
    return origin !== null && allowed.includes(origin)
  }

  // No Origin. A browser that says the request is cross-site should have sent
  // one; refusing it closes the header-stripping gap. `same-site` is a
  // different origin (another subdomain) and is refused too.
  const fetchSite = info.secFetchSite?.toLowerCase()
  if (fetchSite === 'cross-site' || fetchSite === 'same-site') return false
  if (fetchSite === 'same-origin') return true

  if (info.referer) {
    const refererOrigin = normalizeOrigin(info.referer)
    return refererOrigin !== null && allowed.includes(refererOrigin)
  }

  return true
}
