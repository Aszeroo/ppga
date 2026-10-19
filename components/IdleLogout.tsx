'use client'

import { useEffect } from 'react'

/**
 * PPGA #49 (owner preview review, the idle-session fix): a signed-in learner
 * who walks away for 30 MINUTES is logged out — the same `confirm: true`
 * POST the logout page's own button carries (the server revokes the refresh
 * token at the Auth service and clears every session cookie), then the
 * browser lands on the locale's LOGIN title screen. The mount decision is
 * the FRAME's (`app/[locale]/layout.tsx`: framed + sessioned only — never a
 * standalone title screen), so this component adds nothing to the login
 * screen a signed-out caller already sees.
 *
 * Activity is `pointerdown`/`keydown`/`wheel`/`touchstart`/`scroll` (all
 * PASSIVE listeners — the handler only re-arms the timer, no per-event work,
 * nothing blocking). Timers live in `useEffect` only: never a server render,
 * and the cleanup clears the timer AND every listener (the idle countdown
 * never survives the component).
 */
const IDLE_MS = 30 * 60 * 1000

/** The presence signals that re-arm the 30-minute countdown. */
const ACTIVITY_EVENTS = ['pointerdown', 'keydown', 'wheel', 'touchstart', 'scroll'] as const

export function IdleLogout({ locale }: { locale: string }) {
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | undefined = undefined

    const onIdle = () => {
      // The logout page's exact call shape (the route's Zod gate demands the
      // `confirm: true` body — a bare POST clears nothing). A network miss
      // never traps the caller in the app: the login screen follows either
      // way (the cookie is the authority, and it rides server-side).
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
        .catch(() => undefined)
        .finally(() => {
          window.location.href = `/${locale}/login`
        })
    }

    const arm = () => {
      if (timer !== undefined) clearTimeout(timer)
      timer = setTimeout(onIdle, IDLE_MS)
    }

    arm()
    for (const event of ACTIVITY_EVENTS) {
      window.addEventListener(event, arm, { passive: true })
    }
    return () => {
      if (timer !== undefined) clearTimeout(timer)
      for (const event of ACTIVITY_EVENTS) {
        window.removeEventListener(event, arm)
      }
    }
  }, [locale])

  return null
}
