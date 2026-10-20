import { describe, expect, test } from 'vitest'

import { createRateLimiter, firstLimited } from '../../lib/rateLimit'

/**
 * Ticket #63: the limiter's policy is exercised with an injected clock and
 * store — no timers, no network. This is the exact module the auth routes
 * wrap, so "N attempts → throttled", "window resets", and "success resets"
 * are tested here rather than assumed.
 */
const fakeClock = (start = 1_000_000) => {
  let current = start
  return {
    now: () => current,
    advance: (ms: number) => {
      current += ms
    },
  }
}

describe('createRateLimiter', () => {
  test('N failed attempts lock the key; the 429 carries Retry-After', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ maxAttempts: 3, windowSeconds: 60, now: clock.now })

    expect(limiter.check('handle:64110001').limited).toBe(false)
    expect(limiter.recordFailure('handle:64110001').limited).toBe(false)
    expect(limiter.recordFailure('handle:64110001').limited).toBe(false)

    const crossing = limiter.recordFailure('handle:64110001')
    expect(crossing.limited).toBe(true)
    expect(crossing.justLimited).toBe(true)
    expect(crossing.retryAfterSeconds).toBe(60)

    // The next request is blocked before any credential work happens.
    const blocked = limiter.check('handle:64110001')
    expect(blocked.limited).toBe(true)
    expect(blocked.retryAfterSeconds).toBe(60)
    expect(blocked.remaining).toBe(0)
  })

  test('the window expires and the key works again', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ maxAttempts: 2, windowSeconds: 30, now: clock.now })

    limiter.recordFailure('ip:203.0.113.9')
    expect(limiter.recordFailure('ip:203.0.113.9').limited).toBe(true)

    clock.advance(29_000)
    expect(limiter.check('ip:203.0.113.9').limited).toBe(true)
    expect(limiter.check('ip:203.0.113.9').retryAfterSeconds).toBe(1)

    clock.advance(1_000)
    expect(limiter.check('ip:203.0.113.9').limited).toBe(false)
    expect(limiter.recordFailure('ip:203.0.113.9').limited).toBe(false)
  })

  test('a successful sign-in resets the counter', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ maxAttempts: 3, windowSeconds: 60, now: clock.now })

    limiter.recordFailure('handle:admin')
    limiter.recordFailure('handle:admin')
    expect(limiter.check('handle:admin').remaining).toBe(1)

    limiter.reset('handle:admin')
    expect(limiter.check('handle:admin').limited).toBe(false)
    expect(limiter.check('handle:admin').remaining).toBe(3)
    expect(limiter.recordFailure('handle:admin').remaining).toBe(2)
  })

  test('keys are independent (handle vs IP do not share a window)', () => {
    const clock = fakeClock()
    const limiter = createRateLimiter({ maxAttempts: 1, windowSeconds: 60, now: clock.now })

    expect(limiter.recordFailure('handle:a').limited).toBe(true)
    expect(limiter.check('handle:b').limited).toBe(false)
    expect(limiter.check('ip:1.2.3.4').limited).toBe(false)
  })

  test('an injected store is shared between limiter instances', () => {
    const clock = fakeClock()
    const store = new Map()
    const first = createRateLimiter({ maxAttempts: 1, windowSeconds: 60, now: clock.now, store })
    const second = createRateLimiter({ maxAttempts: 1, windowSeconds: 60, now: clock.now, store })

    first.recordFailure('shared')
    expect(second.check('shared').limited).toBe(true)
  })
})

describe('firstLimited', () => {
  const blocked = (retryAfterSeconds: number) => ({
    limited: true,
    remaining: 0,
    retryAfterSeconds,
    justLimited: false,
  })

  test('returns null when no scope is blocked', () => {
    expect(firstLimited([
      { scope: 'handle', state: { limited: false, remaining: 2, retryAfterSeconds: 0, justLimited: false } },
      { scope: 'ip', state: { limited: false, remaining: 10, retryAfterSeconds: 0, justLimited: false } },
    ])).toBeNull()
  })

  test('returns the scope with the longest retry window', () => {
    const result = firstLimited([
      { scope: 'handle', state: blocked(10) },
      { scope: 'ip', state: blocked(40) },
    ])
    expect(result?.scope).toBe('ip')
    expect(result?.state.retryAfterSeconds).toBe(40)
  })
})
