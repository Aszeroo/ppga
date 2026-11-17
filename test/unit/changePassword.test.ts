import { afterEach, beforeEach, expect, test, vi } from 'vitest'

vi.mock('server-only', () => ({}))

import { changePasswordViaSupaHttp } from '../../lib/sup/auth'

const realFetch = globalThis.fetch
beforeEach(() => {
  process.env.NEXT_PUBLIC_SUP_URL = 'https://example.supabase.co'
  process.env.NEXT_PUBLIC_SUP_ANON_KEY = 'anon-key'
})
afterEach(() => {
  vi.unstubAllGlobals()
  globalThis.fetch = realFetch
})

test('wrong current password never reaches the password update', async () => {
  const fetchMock = vi.fn().mockResolvedValue(new Response(null, { status: 400 }))
  vi.stubGlobal('fetch', fetchMock)
  const result = await changePasswordViaSupaHttp('token', 'new-password-123', 'wrong-password-123', '64110001@ppga.local')
  expect(result.ok).toBe(false)
  expect(result.detail).toBe('current_password_invalid')
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/v1/token?grant_type=password')
})

test('correct current password verifies then updates', async () => {
  const fetchMock = vi.fn()
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
    .mockResolvedValueOnce(new Response('{}', { status: 200 }))
  vi.stubGlobal('fetch', fetchMock)
  const result = await changePasswordViaSupaHttp('token', 'new-password-123', 'right-password-123', '64110001@ppga.local')
  expect(result.ok).toBe(true)
  expect(fetchMock).toHaveBeenCalledTimes(2)
  expect(String(fetchMock.mock.calls[0][0])).toContain('/auth/v1/token?grant_type=password')
  expect(String(fetchMock.mock.calls[1][0])).toContain('/auth/v1/user')
  expect(fetchMock.mock.calls[1][1]?.method).toBe('PUT')
})

test('missing email fails closed', async () => {
  const fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
  const result = await changePasswordViaSupaHttp('token', 'new-password-123', 'right-password-123')
  expect(result.ok).toBe(false)
  expect(result.detail).toBe('no-session-email')
  expect(fetchMock).not.toHaveBeenCalled()
})
