/**
 * Ticket #63: a small fixed-window rate limiter with an injectable clock and
 * store. It is deliberately dependency-free (no `server-only`, no Supabase) so
 * the throttle policy can be unit-tested with a fake clock; the route-facing
 * wrapper lives in `lib/authGuard.ts`.
 *
 * A window is `windowSeconds` long from the first failure in the key. Once
 * `maxAttempts` failures land inside that window, `check()` reports limited
 * until the window's `resetAt` passes. The store is a plain `Map` by default;
 * callers may inject a compatible map (for tests, or to swap in a shared
 * store later).
 *
 * Limitation (documented in `.env.example`): the default store is in-process
 * memory, so on a multi-instance/serverless deployment each instance counts
 * independently. The map is swappable so a shared store can be added without
 * touching call sites.
 */

export interface RateLimitOptions {
  /** Failures allowed inside one window before the key locks. */
  maxAttempts: number
  /** Window length in seconds. */
  windowSeconds: number
  /** Injectable clock (milliseconds since epoch). */
  now?: () => number
  /** Injectable store; defaults to a fresh `Map`. */
  store?: Map<string, RateLimitEntry>
}

export interface RateLimitEntry {
  count: number
  /** Epoch milliseconds when the window ends. */
  resetAt: number
}

export interface RateLimitState {
  limited: boolean
  remaining: number
  /** Whole seconds until the window resets (0 when not limited). */
  retryAfterSeconds: number
  /** True when THIS record landed exactly on the limit. */
  justLimited: boolean
}

export interface RateLimiter {
  readonly maxAttempts: number
  readonly windowSeconds: number
  /** Inspect without consuming an attempt. */
  check(key: string): RateLimitState
  /** Count one failed attempt (starts the window when absent/expired). */
  recordFailure(key: string): RateLimitState
  /** Clear a key (a successful sign-in resets the handle + IP counters). */
  reset(key: string): void
}

const state = (limited: boolean, remaining: number, retryAfterSeconds: number, justLimited = false): RateLimitState => ({
  limited,
  remaining,
  retryAfterSeconds,
  justLimited,
})

export function createRateLimiter(options: RateLimitOptions): RateLimiter {
  const maxAttempts = Math.max(1, Math.floor(options.maxAttempts))
  const windowSeconds = Math.max(1, Math.floor(options.windowSeconds))
  const windowMs = windowSeconds * 1000
  const now = options.now ?? (() => Date.now())
  const store = options.store ?? new Map<string, RateLimitEntry>()

  const liveEntry = (key: string): RateLimitEntry | null => {
    const entry = store.get(key)
    if (!entry) return null
    if (now() >= entry.resetAt) {
      store.delete(key)
      return null
    }
    return entry
  }

  const readState = (key: string, justLimited = false): RateLimitState => {
    const entry = liveEntry(key)
    if (!entry || entry.count < maxAttempts) {
      return state(false, maxAttempts - (entry?.count ?? 0), 0, justLimited)
    }
    const retryAfterSeconds = Math.max(1, Math.ceil((entry.resetAt - now()) / 1000))
    return state(true, 0, retryAfterSeconds, justLimited)
  }

  return {
    maxAttempts,
    windowSeconds,
    check: (key) => readState(key),
    recordFailure: (key) => {
      const current = liveEntry(key)
      if (!current) {
        store.set(key, { count: 1, resetAt: now() + windowMs })
        return readState(key, maxAttempts === 1)
      }
      current.count += 1
      return readState(key, current.count === maxAttempts)
    },
    reset: (key) => {
      store.delete(key)
    },
  }
}

export interface LimitedScope {
  scope: string
  state: RateLimitState
}

/** Pick the longest still-blocked scope from a handle/IP (or account/IP) pair. */
export function firstLimited(
  candidates: Array<{ scope: string; state: RateLimitState }>,
): LimitedScope | null {
  let blocked: LimitedScope | null = null
  for (const candidate of candidates) {
    if (!candidate.state.limited) continue
    if (!blocked || candidate.state.retryAfterSeconds > blocked.state.retryAfterSeconds) {
      blocked = candidate
    }
  }
  return blocked
}
