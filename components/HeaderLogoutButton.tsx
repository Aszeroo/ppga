'use client'

import { useCallback, useState } from 'react'

/**
 * One-click logout from the framed header. The old header chip was a
 * client-side `<Link href="/logout">`: the shared locale layout had already
 * rendered its `standalone` decision for the framed page, so /logout kept the
 * header/footer frame and the page then asked for a second confirm click.
 *
 * This posts the logout page's exact `confirm: true` body and assigns
 * `window.location.href` to the redirect the API returns. That is a FULL page
 * load, so the layout re-renders on `/<locale>/login` and the title screen is
 * standalone. Any failure still leaves the app (`fallbackHref`) — the cookie
 * is cleared server-side whenever the request lands, and the login screen must
 * follow either way.
 *
 * The chip styling is the shared `.ppg-nav-item .ppg-logout-chip` face; the
 * busy state is `aria-busy` + `disabled` so a second click cannot fire while
 * the request is in flight. The visible label never changes.
 */
export interface HeaderLogoutButtonProps {
  /** The visible chip label (`nav.logout`). */
  label: string
  /** Where a failed logout lands (`/<locale>/logout`, the direct page). */
  fallbackHref: string
}

export function HeaderLogoutButton({ label, fallbackHref }: HeaderLogoutButtonProps) {
  const [busy, setBusy] = useState(false)

  const handleClick = useCallback(() => {
    setBusy(true)
    fetch('/api/auth/logout', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ confirm: true }),
    })
      .then(async (res) => {
        const result = await res.json().catch(() => ({}))
        if (result.ok && result.redirect) {
          window.location.href = result.redirect
        } else {
          window.location.href = fallbackHref
        }
      })
      .catch(() => {
        window.location.href = fallbackHref
      })
  }, [fallbackHref])

  return (
    <button
      type="button"
      className="ppg-nav-item ppg-logout-chip"
      onClick={handleClick}
      disabled={busy}
      aria-busy={busy ? 'true' : undefined}
    >
      {label}
    </button>
  )
}
