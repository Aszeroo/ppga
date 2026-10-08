"use client"

import { Suspense } from 'react'

import { useCallback, useState } from 'react'

import { z } from 'zod'

import { useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

/**
 * Ticket #3 change-password page: the signed-in user sends their current and
 * new password. Zod validates before the POST; the API route re-validates and
 * calls the Supabase Auth service. Every outcome is an observable state — the
 * service's message (weak password / needs reauthentication / same password)
 * renders verbatim, never as a blank screen. `force-dynamic`.
 *
 * Ticket #4: the copy moves into messages (`changePassword.intro`,
 * `changePassword.currentPassword`, `changePassword.newPassword`,
 * `changePassword.submit`, `changePassword.busy`, `changePassword.afterSuccess`,
 * `changePassword.fallbackSuspense`) so the Thai default and the English
 * switch both speak it; the missing-key fallback chain speaks first.
 */
export const dynamic = 'force-dynamic'

const formSchema = z
  .object({
    currentPassword: z.string().min(8).max(72),
    newPassword: z.string().min(8).max(72),
  })
  .strict()

export default function ChangePasswordPage() {
  const t = useTranslations('changePassword')
  const [message, setMessage] = useState('')
  const [busy, setBusy] = useState(false)

  const handleSubmit = useCallback(
    (
      event: {
        preventDefault: () => void
        currentTarget: HTMLFormElement
      },
    ) => {
      event.preventDefault()
      const form = new FormData(event.currentTarget)
      const parsed = formSchema.safeParse({
        currentPassword: form.get('currentPassword') ?? '',
        newPassword: form.get('newPassword') ?? '',
      })
      if (!parsed.success) {
        setBusy(false)
        setMessage(
          parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join(' · '),
        )
        return
      }

      setBusy(true)
      fetch('/api/auth/change-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          currentPassword: parsed.data.currentPassword,
          newPassword: parsed.data.newPassword,
        }),
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
      <div className="ppg-page-wrap">
        {/** The V3 #55 work-head idiom: the display-font title riding the
         * repo marker classes (`ppg-heading ppg-heading-text`) beside its own
         * face + the honest subline. The title copy REUSES the shipped
         * `nav.changePassword` label (no new string, no new Thai). */}
        <div className="ppg-work-head">
          <h1 className="ppg-heading ppg-heading-text ppg-work-head-title">
            {t('nav:changePassword')}
          </h1>
          <p className="ppg-work-head-sub">{t('intro')}</p>
        </div>
        {/** The form rides the shipped `#55` work-card/work-form face — the
         * fields, ids, names, the zod-gated POST and the `/api/auth/change-
         * password` route stay BYTE-IDENTICAL; only `className` is added. */}
        <div className="ppg-work-card">
          <form onSubmit={handleSubmit} className="ppg-work-form">
            <label className="ppg-field-label" htmlFor="currentPassword">
              {t('currentPassword')}
            </label>
            <input
              id="currentPassword"
              name="currentPassword"
              type="password"
              className="ppg-input"
              required
              minLength={8}
              maxLength={72}
            />
            <label className="ppg-field-label" htmlFor="newPassword">
              {t('newPassword')}
            </label>
            <input
              id="newPassword"
              name="newPassword"
              type="password"
              className="ppg-input"
              required
              minLength={8}
              maxLength={72}
            />
            <button type="submit" className="ppg-button ppg-cta">
              {t('submit')}
            </button>
          </form>
        </div>
        {busy ? (
          <p className="ppg-state-line">{t('busy')}</p>
        ) : null}
        {message ? (
          <p className="ppg-state-line">{message}</p>
        ) : null}
        <p>
          <Link href="/profile" className="ppg-link">
            {t('intro')}
          </Link>{' — '}
          {t('afterSuccess')}
        </p>
      </div>
    </Suspense>
  )
}
