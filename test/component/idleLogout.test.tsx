/**
 * @vit-environment jsdom
 */
import { render, cleanup } from '@testing-library/react'
import { afterEach, beforeEach, expect, test, vi } from 'vitest'

import { IdleLogout } from '../../components/IdleLogout'

/**
 * PPGA #49 (idle auto-logout): the 30-minute countdown is the WHOLE contract
 * — expiry fires the logout page's exact `confirm: true` POST and lands the
 * browser on the locale's login screen; any pointer/key/wheel/touch/scroll
 * activity re-arms the countdown from zero; unmount clears the timer AND the
 * listeners (the countdown never survives the component). Fake timers own
 * the clock; `window.location` is replaced with a plain href sink so the
 * navigation is observable without a real page load.
 */
const IDLE_MS = 30 * 60 * 1000

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  vi.useFakeTimers()
  fetchMock = vi.fn().mockResolvedValue({ ok: true, json: async () => ({ ok: true }) })
  vi.stubGlobal('fetch', fetchMock)
  Object.defineProperty(window, 'location', {
    configurable: true,
    writable: true,
    value: { href: '/' },
  })
})

afterEach(() => {
  cleanup()
  vi.useRealTimers()
  vi.unstubAllGlobals()
})

test('a mounted session idles 30 minutes: the confirm-logout POST lands, the browser routes to /<locale>/login', async () => {
  render(<IdleLogout locale="th" />)

  await vi.advanceTimersByTimeAsync(IDLE_MS)

  expect(fetchMock).toHaveBeenCalledTimes(1)
  const [url, init] = fetchMock.mock.calls[0] as [string, RequestInit]
  expect(url).toBe('/api/auth/logout')
  expect(init.method).toBe('POST')
  expect(JSON.parse(String(init.body))).toEqual({ confirm: true })
  expect(window.location.href).toBe('/th/login')
})

test('activity re-arms the countdown: 29 min idle + a keystroke + 29 min idle never logs out', async () => {
  render(<IdleLogout locale="en" />)

  await vi.advanceTimersByTimeAsync(IDLE_MS - 60_000)
  window.dispatchEvent(new Event('keydown'))
  await vi.advanceTimersByTimeAsync(IDLE_MS - 60_000)

  expect(fetchMock).not.toHaveBeenCalled()

  // 30 FULL minutes after the keystroke the countdown speaks.
  await vi.advanceTimersByTimeAsync(60_000)
  expect(fetchMock).toHaveBeenCalledTimes(1)
  expect(window.location.href).toBe('/en/login')
})

test('unmount clears the timer and the listeners: no logout fetch after the component is gone', async () => {
  const { unmount } = render(<IdleLogout locale="th" />)
  unmount()

  // Activity would re-arm a live listener; the timer itself is already dead.
  window.dispatchEvent(new Event('pointerdown'))
  await vi.advanceTimersByTimeAsync(IDLE_MS * 2)

  expect(fetchMock).not.toHaveBeenCalled()
})
