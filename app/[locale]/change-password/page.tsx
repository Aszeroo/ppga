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
      <section>
        <p>{t('intro')}</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="currentPassword">{t('currentPassword')}</label>
          <input
            id="currentPassword"
            name="currentPassword"
            type="password"
            required
            minLength={8}
            maxLength={72}
          />
          <label htmlFor="newPassword">{t('newPassword')}</label>
          <input
            id="newPassword"
            name="newPassword"
            type="password"
            required
            minLength={8}
            maxLength={72}
          />
          <button type="submit">{t('submit')}</button>
        </form>
        {busy ? <p>{t('busy')}</p> : null}
        {message ? <p>{message}</p> : null}
        <p>
          <Link href="/profile">{t('intro')}</Link> — {t('afterSuccess')}
        </p>
      </section>
    </Suspense>
  )
}
