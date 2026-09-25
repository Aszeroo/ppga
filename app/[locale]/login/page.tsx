"use client"

import { Suspense } from 'react'

import { useCallback, useState } from 'react'

import { z } from 'zod'

import { useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

/**
 * Ticket #3 login page — client-side submit so the POST body is JSON (the API
 * route parses `req.json()`), with Zod validating before the network call. The
 * observable outcome is one of: signed-in (the response carries `redirect`),
 * a validation error naming the field, or an Auth-service error carried
 * verbatim. Nothing here is a blank screen. `force-dynamic` so `next build`
 * never pre-render a snapshot of an unconfigured service.
 *
 * Ticket #4: every copy string moves to the messages files (`login.intro`,
 * `login.identifier`, `login.password`, `login.submit`, `login.busy`,
 * `login.afterSuccess`, `login.fallbackSuspense`) so the Thai default and the
 * explicit English switch both speak it, and the missing-key fallback chain
 * has a leg to speak before any raw key reaches the browser.
 */
export const dynamic = 'force-dynamic'

const identifierSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9._-]+$/i)

const formSchema = z
  .object({
    identifier: identifierSchema,
    password: z.string().min(8).max(72),
  })
  .strict()

export default function LoginPage() {
  const t = useTranslations('login')
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
        identifier: form.get('identifier') ?? '',
        password: form.get('password') ?? '',
      })
      if (!parsed.success) {
        setBusy(false)
        setMessage(
          parsed.error.issues.map((i) => `${String(i.path[0] ?? 'input')}: ${i.message}`).join(' · '),
        )
        return
      }

      setBusy(true)
      fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(parsed.data),
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
          <label htmlFor="identifier">{t('identifier')}</label>
          <input id="identifier" name="identifier" required minLength={3} maxLength={50} />
          <label htmlFor="password">{t('password')}</label>
          <input
            id="password"
            name="password"
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
          <Link href="/">{t('intro')}</Link> — {t('afterSuccess')}
        </p>
      </section>
    </Suspense>
  )
}
