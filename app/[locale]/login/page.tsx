"use client"

import { Suspense } from 'react'

import { useCallback, useState } from 'react'

import { z } from 'zod'

import { useTranslations } from 'next-intl'
import { Link } from '../../../lib/i18n/routing'

import { LanguageSelectorPill } from '../../../components/LanguageSelectorPill'

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
  const tShell = useTranslations('shell')
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

  /**
   * PPGA #49 (owner preview review): the login page IS the V3 design's
   * `#s-login` title screen — the decorated stage the standalone Shell
   * renders (the floating clouds/sparkles/squares), and HERE the design's
   * centred card verbatim: the 🎓 mascot, the pixel `PPGA` wordmark (pink +
   * the blue/purple pixel shadow), the gradient `ยินดีต้อนรับ!`, the two-line
   * gamified blurb, the labelled inputs (the design's placeholders), the ONE
   * full-width pink CTA inside the card, and the language switch on the card
   * (`LanguageSelectorPill` — the same select + POST the frame's switcher
   * ships). The OLD-corpus strings the review flagged (`ร.บักะนัักเรียน`,
   * `รหัส`, `ลงชื่อ`) are replaced by the design's OWN bytes (extracted
   * byte-exactly from `UI_UX_design/index.html` into the messages files).
   *
   * HARD CONSTRAINT — the FORM CONTRACT is byte-identical to what #3/#41
   * shipped: the same `identifier`/`password` names + ids, the same input
   * types + required/minLength/maxLength, the same client-side submit (the
   * `#api/auth/login` fetch, no form action), the same Zod gate, and the
   * same busy/message copy lines. Only the markup AROUND the form, the
   * classes and the copy changed; the e2e selectors (`#identifier`,
   * `#password`, the submit's accessible name) hold untouched.
   */
  return (
    <Suspense fallback={<div>{t('fallbackSuspense')}</div>}>
      <section className="ppg-login-card ppg-strip-top">
        <div className="ppg-mascot" aria-hidden="true">
          🎓
        </div>
        <h1 className="ppg-title-h1">{tShell('logo')}</h1>
        <p className="ppg-title-welcome">{t('welcome')}</p>
        <p className="ppg-title-sub ppg-title-blurb">
          {t('blurbLine1')}
          <br />
          {t('blurbLine2')}
        </p>
        <form className="ppg-login-form" onSubmit={handleSubmit}>
          <div className="ppg-login-field">
            <label className="ppg-field-label" htmlFor="identifier">{t('identifier')}</label>
            <input
              id="identifier"
              name="identifier"
              className="ppg-input"
              placeholder={t('identifierPlaceholder')}
              required
              minLength={3}
              maxLength={50}
            />
          </div>
          <div className="ppg-login-field">
            <label className="ppg-field-label" htmlFor="password">{t('password')}</label>
            <input
              id="password"
              name="password"
              type="password"
              className="ppg-input"
              placeholder={t('passwordPlaceholder')}
              required
              minLength={8}
              maxLength={72}
            />
          </div>
          <button type="submit" className="ppg-button ppg-cta ppg-cta-block">
            {t('submit')}
          </button>
        </form>
        {busy ? <p className="ppg-form-note">{t('busy')}</p> : null}
        {message ? <p className="ppg-form-note">{message}</p> : null}
        {/** The switch on the card — the design's `.lang-sw` row (the same
         * select mechanics as the frame's switcher: the `/api/locale` POST +
         * the locale navigation). */}
        <LanguageSelectorPill />
        <p className="ppg-title-sub ppg-title-after">
          <Link href="/">{t('intro')}</Link> — {t('afterSuccess')}
        </p>
      </section>
    </Suspense>
  )
}
