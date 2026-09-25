import 'server-only'

import { createClient } from '@supabase/supabase-js'
import type { NextRequest, NextResponse } from 'next/server'
import { z } from 'zod'

/**
 * Ticket #3 server-side Auth module: login, logout and change-password all run
 * here. The client-side browser only ever reaches the anon key; the session is
 * carried in an httpOnly cookie (Next cookie jar) so a refresh token never lands
 * in localStorage. Missing environment yields `null` so the pages can show
 * "not-configured" instead of crashing.
 */

/** The login identifier scheme (see migration + README): a synthetic
 * `<handle>@ppga.local` email. Learners use their provisioned student-ID,
 * teachers/admin use `<role>@ppga.local`. We never require a real email. */
export const studentIdLoginSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9._-]+$/i)

export const loginFormSchema = z
  .object({
    identifier: studentIdLoginSchema,
    password: z.string().min(8).max(72),
  })
  .strict()

export const changePasswordFormSchema = z
  .object({
    newPassword: z.string().min(8).max(72),
    currentPassword: z.string().min(8).max(72),
  })
  .strict()

export const logoutFormSchema = z.object({ confirm: z.literal(true) }).strict()

export interface AuthResult {
  ok: boolean
  detail?: string
  redirect?: string
}

/** Synthetic email from a login handle — the whole point of the scheme. */
export function syntheticEmail(handle: string): string {
  return `${handle.toLowerCase()}@ppga.local`
}

/**
 * Server-side session client. We do NOT use the service-role key for user
 * flows: the user's JWT (from the cookie) is the only authority a learner/
 * teacher/admin can have. The anon key is allowed server-side (Next ships the
 * NEXT_PUBLIC_* variables to the server build too).
 */
export function createSupabaseSessionClient() {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY

  if (!url || !anonKey) return null

  return createClient(url, anonKey)
}

/** Raw HTTP call the Supabase Auth service expects (PUT /auth/user). */
export async function changePasswordViaSupaHttp(
  accessToken: string,
  newPassword: string,
  currentPassword: string,
): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  if (!url) return { ok: false, detail: 'NEXT_PUBLIC_SUP_URL missing' }

  const resp = await fetch(`${url}/user`, {
    method: 'PUT',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${accessToken}`,
    },
    body: JSON.stringify({
      password: newPassword,
      // Supabase's Security.UpdatePasswordRequireCurrentPassword gate: when
      // the service demands the old password we send it as `current_password`
      // (400 `current_password_invalid` maps to a UI copy below).
      current_password: currentPassword,
    }),
  })

  if (resp.ok) {
    return { ok: true, detail: 'password updated', redirect: '/profile' }
  }
  const body = await resp.text()
  return { ok: false, detail: `${resp.status} ${body.slice(0, 200)}` }
}

/**
 * Sign-out through the Supabase Auth service (POST /logout with the refresh
 * token). We call the supa client when present so the refresh token is
 * revoked server-side; a missing session still clears the cookie.
 */
export async function signOutViaSupaHttp(refreshToken: string): Promise<AuthResult> {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  if (!url) return { ok: false, detail: 'NEXT_PUBLIC_SUP_URL missing' }

  const resp = await fetch(`${url}/logout`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })

  if (resp.ok || resp.status === 204) {
    return { ok: true, detail: 'signed out', redirect: '/' }
  }
  const body = await resp.text()
  return { ok: false, detail: `${resp.status} ${body.slice(0, 200)}` }
}

/**
 * Password sign-in for a student-ID handle through the server-side supa
 * client (no browser-side key material, no localStorage). Success returns the
 * token bundle the caller puts into an httpOnly cookie; failure carries a
 * message the UI renders verbatim.
 */
export async function signInByHandle(
  handle: string,
  password: string,
): Promise<{ ok: boolean; detail?: string; tokens?: { access_token: string; refresh_token: string } }> {
  const sup = createSupabaseSessionClient()
  if (!sup) return { ok: false, detail: 'not-configured' }

  const { error, data } = await sup.auth.signInWithPassword({
    email: syntheticEmail(handle),
    password,
  })

  if (error) return { ok: false, detail: error.message }

  if (!data) return { ok: false, detail: 'empty session' }

  return {
    ok: true,
    tokens: {
      access_token: data.session.access_token,
      refresh_token: data.session.refresh_token,
    },
  }
}

/**
 * Supa-js `storage` written against the Next cookie jar (supa-v2 no longer
 * ships `cookieAdapter` — the session bundle is read/written through `storage`).
 * The tokens live in an httpOnly, SameSite=lax cookie on `/` so a learner's
 * refresh token never lands in localStorage, and the session is restored
 * server-side before any role-gated page is rendered.
 */
function nextStorage(req: NextRequest, res?: NextResponse) {
  return {
    isServer: true as const,
    getItem(key: string) {
      return req.cookies.get(key)?.value ?? null
    },
    setItem(key: string, value: string) {
      res?.cookies.set(key, value, {
        path: '/',
        httpOnly: true,
        secure: true,
        sameSite: 'lax',
        maxAge: 60 * 60 * 24 * 7,
      })
    },
    removeItem(key: string) {
      res?.cookies.set(key, '', { path: '/', maxAge: 0 })
    },
  }
}

/** Route-scoped session client (cookies read from the request, written to the
 * response). Missing env => `null` so the UI can show not-configured. */
export function createSupaSessionClientForRoute(req: NextRequest, res?: NextResponse) {
  const url = process.env.NEXT_PUBLIC_SUP_URL
  const anonKey = process.env.NEXT_PUBLIC_SUP_ANON_KEY

  if (!url || !anonKey) return null

  return createClient(url, anonKey, {
    auth: {
      storageKey: 'ppga_session',
      storage: nextStorage(req, res),
    },
  })
}
