"use client"

import { Suspense } from 'react'

import { useCallback, useState } from 'react'

import { useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

/**
 * Ticket #3 logout page: one button that clears the httpOnly session cookies
 * and revokes the refresh token at the service. Both outcomes render as text —
 * "signed out" or the service message — never a blank screen. `force-dynamic`.
 *
 * Ticket #4: the copy moves into messages (`logout.intro`, `logout.submit`,
 * `logout.busy`, `logout.fallbackSuspense`) — and the language the learner
 * chose (the `ppga-locale` cookie + the profile row) survives this logout:
 * the next visit speaks the remembered language again after re-login.
 */
export const dynamic = 'force-dynamic'

export default function LogoutPage() {
  const t = useTranslations('logout')
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
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <section>
        <p>{t('intro')}</p>
        <button type="button" onClick={handleClick}>
          {t('submit')}
        </button>
        {busy ? <p>{t('busy')}</p> : null}
        {message ? <p>{message}</p> : null}
        <p>
          <Link href="/profile">{t('intro')}</Link> ·{' '}
          <Link href="/login">{t('intro')}</Link>
        </p>
      </section>
    </Suspense>
  )
}
