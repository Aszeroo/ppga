"use client"

import { Suspense } from 'react'

import { useCallback, useState } from 'react'

import { z } from 'zod'

/**
 * Ticket #3 login page — client-side submit so the POST body is JSON (the API
 * route parses `req.json()`), with Zod validating before the network call. The
 * observable outcome is one of: signed-in (the response carries `redirect`),
 * a validation error naming the field, or an Auth-service error carried
 * verbatim. Nothing here is a blank screen. `force-dynamic` so `next build`
 * never pre-render a snapshot of an unconfigured service.
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
    <Suspense fallback={<div>Preparing the login form…</div>}>
      <section>
        <p>Login with your provisioned student-ID and password.</p>
        <form onSubmit={handleSubmit}>
          <label htmlFor="identifier">Student ID</label>
          <input id="identifier" name="identifier" required minLength={3} maxLength={50} />
          <label htmlFor="password">Password</label>
          <input
            id="password"
            name="password"
            type="password"
            required
            minLength={8}
            maxLength={72}
          />
          <button type="submit">Sign in</button>
        </form>
        {busy ? <p>Signing in…</p> : null}
        {message ? <p>{message}</p> : null}
        <p>
          <a href="/">Home</a> — after a successful login you land on /profile.
        </p>
      </section>
    </Suspense>
  )
}
