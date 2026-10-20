"use client"

import { Suspense } from 'react'

import { useCallback, useState } from 'react'

import { useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

import { LanguageSelectorPill } from '../../../components/LanguageSelectorPill'

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
  const tShell = useTranslations('shell')
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

  /**
   * PPGA #49 (owner preview review): the logout title screen rides the SAME
   * standalone V3 card as login (the Shell renders the decorated stage — the
   * design ships no dedicated logout screen, so the card idiom is the
   * derivation: mascot + the pixel `PPGA` wordmark + the page's own intro
   * line + the ONE CTA + the language switch on the card). The MECHANICS are
   * byte-identical to what #3 shipped: the same `confirm: true` POST to
   * `/api/auth/logout`, the same revoke + observable redirect, the same
   * busy/message copy lines and the same follow-up links.
   */
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <section className="ppg-login-card ppg-strip-top">
        <div className="ppg-mascot" aria-hidden="true">
          🎓
        </div>
        <h1 className="ppg-title-h1">{tShell('logo')}</h1>
        <p className="ppg-title-sub ppg-title-blurb">{t('intro')}</p>
        <button type="button" className="ppg-button ppg-cta ppg-cta-block" onClick={handleClick}>
          {t('submit')}
        </button>
        {busy ? <p className="ppg-form-note">{t('busy')}</p> : null}
        {message ? <p className="ppg-form-note">{message}</p> : null}
        <LanguageSelectorPill />
        <p className="ppg-title-sub ppg-title-after">
          <Link href="/profile">{t('intro')}</Link> ·{' '}
          <Link href="/login">{t('intro')}</Link>
        </p>
      </section>
    </Suspense>
  )
}
