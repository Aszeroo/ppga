import { describe, expect, test } from 'vitest'

import {
  isRequestOriginAllowed,
  normalizeOrigin,
  parseAllowedOrigins,
  type OriginRequestInfo,
} from '../../lib/requestOrigin'

/**
 * Ticket #63: the Origin decision table. Legitimate same-origin browser
 * requests pass; a foreign Origin is refused; a cross-site request that
 * stripped `Origin` is refused through `Sec-Fetch-Site`; non-browser clients
 * without either header keep working.
 */
const base: OriginRequestInfo = {
  url: 'https://ppga.example.com/api/self-check/submit',
  host: 'ppga.example.com',
  forwardedHost: 'ppga.example.com',
  forwardedProto: 'https',
  origin: null,
  referer: null,
  secFetchSite: null,
}

const info = (overrides: Partial<OriginRequestInfo>): OriginRequestInfo => ({ ...base, ...overrides })

describe('origin evaluation', () => {
  test('same-origin POST passes (explicit Origin and derived deployment origin)', () => {
    expect(isRequestOriginAllowed(info({ origin: 'https://ppga.example.com' }))).toBe(true)
    expect(isRequestOriginAllowed(info({ origin: 'https://ppga.example.com', secFetchSite: 'same-origin' }))).toBe(true)
  })

  test('a foreign Origin is rejected', () => {
    expect(isRequestOriginAllowed(info({ origin: 'https://evil.example.net' }))).toBe(false)
    expect(isRequestOriginAllowed(info({ origin: 'http://ppga.example.com' }))).toBe(false)
    expect(isRequestOriginAllowed(info({ origin: 'null' }))).toBe(false)
  })

  test('a missing Origin with cross-site/same-site fetch metadata is rejected', () => {
    expect(isRequestOriginAllowed(info({ origin: null, secFetchSite: 'cross-site' }))).toBe(false)
    expect(isRequestOriginAllowed(info({ origin: null, secFetchSite: 'same-site' }))).toBe(false)
  })

  test('non-browser callers without Origin/Referer/Sec-Fetch-Site keep working', () => {
    expect(isRequestOriginAllowed(info({ origin: null }))).toBe(true)
  })

  test('a Referer must be allowed when it is the only origin signal', () => {
    expect(isRequestOriginAllowed(info({ origin: null, referer: 'https://evil.example.net/x' }))).toBe(false)
    expect(isRequestOriginAllowed(info({ origin: null, referer: 'https://ppga.example.com/x' }))).toBe(true)
  })

  test('an explicit allowlist replaces the derived origin', () => {
    const allowlist = parseAllowedOrigins('https://ppga.example.com, https://ppga-git-main.vercel.app')
    expect(allowlist).toEqual(['https://ppga.example.com', 'https://ppga-git-main.vercel.app'])
    expect(isRequestOriginAllowed(info({ origin: 'https://ppga-git-main.vercel.app' }), allowlist)).toBe(true)
    expect(isRequestOriginAllowed(info({ origin: 'https://other.vercel.app' }), allowlist)).toBe(false)
  })

  test('Vercel preview hosts are derived from x-forwarded-host (no env pinning)', () => {
    const preview = info({
      url: 'https://internal.local/api/x',
      host: 'internal.local',
      forwardedHost: 'ppga-abc123-aszeroo.vercel.app',
      forwardedProto: 'https',
      origin: 'https://ppga-abc123-aszeroo.vercel.app',
    })
    expect(isRequestOriginAllowed(preview)).toBe(true)
  })

  test('the first hop of a comma-separated forwarded host/proto is used', () => {
    const proxied = info({
      url: 'http://localhost:3000/api/x',
      host: 'localhost:3000',
      forwardedHost: 'ppga.example.com, internal.lb',
      forwardedProto: 'https, http',
      origin: 'https://ppga.example.com',
    })
    expect(isRequestOriginAllowed(proxied)).toBe(true)
  })

  test('normalizeOrigin strips paths/default ports and ignores non-http schemes', () => {
    expect(normalizeOrigin('https://ppga.example.com/')).toBe('https://ppga.example.com')
    expect(normalizeOrigin('https://ppga.example.com:443/x')).toBe('https://ppga.example.com')
    expect(normalizeOrigin('ftp://ppga.example.com')).toBeNull()
    expect(normalizeOrigin('not a url')).toBeNull()
  })
})
