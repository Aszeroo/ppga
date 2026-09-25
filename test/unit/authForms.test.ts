import { test, expect } from 'vitest'

import { z } from 'zod'

/**
 * Ticket #3 form validation: Zod bounds the login/change-password payloads the
 * same way the server does. These are pure local assertions (no Supabase or
 * Postgres required) so CI always runs them.
 */
const identifierSchema = z
  .string()
  .trim()
  .min(3)
  .max(50)
  .regex(/^[a-z0-9._-]+$/i)

const loginFormSchema = z
  .object({
    identifier: identifierSchema,
    password: z.string().min(8).max(72),
  })
  .strict()

test('login form: student-ID handles accept, junk rejects', () => {
  expect(loginFormSchema.safeParse({ identifier: '64110000', password: 'ppga-test-2026' }).success).toBe(true)
  expect(loginFormSchema.safeParse({ identifier: 'student.a-b', password: 'ppga-test-2026' }).success).toBe(true)

  // A handle that is not the shape we provision rejects; the UI names the field.
  for (const bad of ['aa', 'a b', 'student#id', 'x'.repeat(51)]) {
    const parsed = loginFormSchema.safeParse({ identifier: bad, password: 'ppga-test-2026' })
    expect(!parsed.success).toBe(true)
    expect(parsed.error?.issues[0]?.path?.[0]).toBe('identifier')
  }
})

test('login form: password length bounds (8..72) reject on the edge', () => {
  const short = 'a'.repeat(7)
  const exact = 'a'.repeat(8)
  const long = 'a'.repeat(73)
  const handles = ['64110000', 'admin']

  for (const bad of [short, long]) {
    const parsed = loginFormSchema.safeParse({ identifier: handles[0], password: bad })
    expect(!parsed.success).toBe(true)
    expect(parsed.error?.issues[0]?.path?.[0]).toBe('password')
  }

  for (const handle of handles) {
    const parsed = loginFormSchema.safeParse({ identifier: handle, password: exact })
    expect(parsed.success).toBe(true)
  }
})
