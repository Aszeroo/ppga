"use client"

import { Suspense } from 'react'

import { useCallback, useState } from 'react'

/**
 * Ticket #3 logout page: one button that clears the httpOnly session cookies
 * and revokes the refresh token at the service. Both outcomes render as text —
 * "signed out" or the service message — never a blank screen. `force-dynamic`.
 */
export const dynamic = 'force-dynamic'

export default function LogoutPage() {
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const handleClick = useCallback(
    (event: { preventDefault: () => void }) => {
      event.preventDefault()
      setBusy(true)
      fetch('/api/auth/logout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ confirm: true }),
      })
        .then(async (res) => {
          const result = await res.json()
          if (result.ok && result.redirect) {
            window.location.href = result.redirect
          } else {
            setMessage(result.detail ?? `HTTP ${res.status}`)
          }
        })
        .catch(() => setMessage('network error'))
    },
    [],
  )

  return (
    <Suspense fallback={<div>Preparing the logout button…</div>}>
      <section>
        <p>Sign out of PPGA — your session cookies are cleared and the</p>
        <p>refresh token is revoked at the service.</p>
        <button type="button" onClick={handleClick}>
          Logout
        </button>
        {busy ? <p>Signing out…</p> : null}
        {message ? <p>{message}</p> : null}
        <p>
          <a href="/profile">Profile</a> · <a href="/login">Login</a>
        </p>
      </section>
    </Suspense>
  )
}
