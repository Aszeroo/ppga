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
      {/**
       * PPGA #41 stage 1: the login form rides the STANDALONE 8-bit
       * title/start screen the Shell renders outside the frame (the
       * locale layout's `standalone` decision) — identity + `shell.start` +
       * this form. A MINIMAL restyle only: the controls take the token
       * pixel classes (`.ppg-input` / `.ppg-button` — the focus-ring +
       * reduced-motion targets, state never colour-alone); the submit
       * handler, the Zod gate, the API route and the observable redirect
       * are UNTOUCHED (no new auth logic).
       */}
      <section className="ppg-title-screen-body">
        {/** PPGA #51: the V3 login title screen — the gallery's welcome +
         * gamified blurb ride the card above the SAME form (#41's submit
         * handler, Zod gate, API route + redirect UNTOUCHED). Every new copy
         * string flows through `messages` (`login.welcome`,
         * `login.gameBlurb` — the Thai verbatim from the design gallery); the
         * controls ride the V3 classes (`.ppg-field-label`, `.ppg-input`,
         * the one primary CTA `.ppg-cta`). */}
        <p className="ppg-title-welcome">{t('welcome')}</p>
        <p className="ppg-title-sub">{t('gameBlurb')}</p>
        <p className="ppg-card-text">{t('intro')}</p>
        <form className="ppg-login-form" onSubmit={handleSubmit}>
          <label className="ppg-field-label" htmlFor="identifier">{t('identifier')}</label>
          <input id="identifier" name="identifier" className="ppg-input" required minLength={3} maxLength={50} />
          <label className="ppg-field-label" htmlFor="password">{t('password')}</label>
          <input
            id="password"
            name="password"
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
        {busy ? <p className="ppg-form-note">{t('busy')}</p> : null}
        {message ? <p className="ppg-form-note">{message}</p> : null}
        <p className="ppg-title-sub">
          <Link href="/">{t('intro')}</Link> — {t('afterSuccess')}
        </p>
      </section>
    </Suspense>
  )
}
