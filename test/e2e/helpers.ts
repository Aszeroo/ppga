import path from 'node:path'

import { expect } from '@playwright/test'

import { type Page } from '@playwright/test'

import enMessages from '../../messages/en.json'
import thMessages from '../../messages/th.json'

/**
 * PPGA #18 journey helpers. The authority for every transition stays the
 * SERVER (the RPC + the RLS + the session's own JWT); the helpers merely
 * DRIVE the browser (fill + click + wait) and read the REAL responses.
 * No mocked outcome ever rides here — the assertions read the observable
 * state: the header/leaderboard XP read from the ledger, the course map's
 * lock text, the teacher queue's rows, the learner result's verdict.
 */

interface Messages {
  [key: string]: unknown
}

const messagesByLocale: Record<string, Messages> = {
  th: thMessages as Messages,
  en: enMessages as Messages,
}

function messagesFor(locale: string): Messages {
  const messages = messagesByLocale[locale]
  if (!messages) throw new Error(`no message bundle for locale ${locale}`)
  return messages
}

/** Copy lookup by dotted path (the same `t` the pages call). */
export function t(path: string[], locale: string): string {
  let v: unknown = messagesFor(locale)
  for (const k of path)
    v = typeof v == 'object' && v != null ? (v as Messages)[k] : undefined
  if (typeof v == 'string') return v
  throw new Error(`messages ${locale} path ${path.join('.')} is not a string (got ${JSON.stringify(v)})`)
}

/** The raw-key-leak regex: the key namespace + a dot + a letter/dot tail.
 * The legit copy has dots only inside numerals/parens (`(8.1-8.4)`,
 * `Total 28 / 35`) — never a letter-prefixed `word.word`. */
export const RAW_KEY_LEAK = /(?:login|logout|home|course|pretest|posttest|survey|lesson|selfcheck|mission|practical|review|header|leaderboard|badges|gallery|profile|change|admin|content|health)\.[a-z.]+/i

export const accounts = {
  admin: 'admin',
  teacher: 'teacher',
  learners: { th: '64110001', en: '64110002' } as Record<string, string>,
}

/** The e2e roster's shared password (the provisioning seed's own temp
 * password — a LOCAL-stack dev credential, never a production secret). */
const PASSWORD = 'ppga-test-2026'

/** The profile uuid (the seed's `auth.users.id` verbatim — the admin
 * console's consent form posts the uuid). */
export const LEARNER_UUID = {
  th: '64110001-0001-0001-0001-000100010001',
  en: '64110002-0002-0002-0002-000200020002',
} as Record<string, string>

export const deckFixture = path.join(__dirname, 'fixtures', 'course-deck.pptx')

/** Sign in through the REAL login page + the REAL `/api/auth/login`. The
 * login page's client handler POSTs the fetch and, on `ok`, assigns
 * `window.location.href = result.redirect` (the gate's own read of the
 * DATABASE's flags at the CALLER's JWT). The observable outcome is therefore
 * the URL the browser LANDS ON — the helper reads that instead of the fetch
 * response body, which the navigation itself makes unreadable (the platform's
 * shipped pattern; the finding is REPORTED here, never rewritten). */
export async function signIn(page: Page, locale: string, identifier: string, expectedSuffix: string) {
  await page.goto(`/${locale}/login`)
  await page.locator('#identifier').fill(identifier)
  await page.locator('#password').fill(PASSWORD)

  const want = `/${locale}${expectedSuffix}`.replace(/\/+$/, '') || `/${locale}`
  await page.getByRole('button', { name: t(['login', 'submit'], locale) }).click()
  await page.waitForURL((url) => url.pathname === want || url.pathname === `${want}/`, { timeout: 30000 })
}

/** The httpOnly session cookies + the gate flags all clear on this. The
 * response waiter is attached BEFORE the click (the `submitForm` pattern) —
 * a fast logout could otherwise land its response before the wait starts. */
export async function signOut(page: Page, locale: string) {
  await page.goto(`/${locale}/logout`)
  const response = page.waitForResponse((r) => r.url().includes('/api/auth/logout') && r.ok())
  await page.getByRole('button', { name: t(['logout', 'submit'], locale) }).click()
  await response
}

/** The native form's submit + the JSON the API route returns — the
 * observable outcome of the SERVER's decision (ok / detail / score /
 * outcome / xp_granted). The JSON screen is the platform's pattern (the
 * form-encoded POST ends on the JSON response — the journey navigates
 * onward from there; the finding is REPORTED, not rewritten). */
export async function submitForm(
  page: Page,
  formAttr: string,
  urlPath: string,
  okExpect = true,
): Promise<Record<string, unknown>> {
  const response = page.waitForResponse((r) => r.url().includes(urlPath))
  // Call sites pass the selector WITH brackets (`[data-ppg-...]`); wrapping
  // again yields `[[data-ppg-...]]` — an invalid CSS selector the browser
  // never resolves (the suite's own first live round caught it).
  await page.locator(formAttr).locator('button[type=submit]').click()
  const landed = await response
  await page.waitForLoadState()
  let body: Record<string, unknown>
  try {
    body = await landed.json()
  } catch {
    // The native form POST navigated the page to the JSON document itself —
    // the shipped pattern's own printout, read off the live page.
    body = JSON.parse(await page.locator('body').innerText()) as Record<string, unknown>
  }
  expect(body.ok).toBe(okExpect)
  return body
}

/** The award the real record shows: `badge <badge_key>` text per award. */
export async function expectBadge(page: Page, locale: string, badgeKey: string) {
  await expect(page.locator('body')).toContainText(`${t(['header', 'badge'], locale)} ${badgeKey}`)
}

/** The XP + Level the gamified spine shows on the signed-in learner. */
export async function expectXpLine(page: Page, xp: number, xpToNext: number) {
  await expect(page.locator('body')).toContainText(`${xp} / ${xpToNext}`)
}

/** The lock/unlock copy the course map shows per module card. */
export function lockStateCopy(locale: string, open: boolean): string {
  return t(['course', 'states', open ? 'open' : 'locked'], locale)
}

/** The CLEARED copy the #44 stage map shows per cleared Module stage. */
export function clearedStateCopy(locale: string): string {
  return t(['course', 'states', 'cleared'], locale)
}

/**
 * PPGA #41 stage 2: the role→nav-items mapping, verbatim (the issue's lists —
 * the journey's observable proof that every destination a role can reach
 * appears in the Shell, and nothing another-role's destination does). The
 * copy rides the `nav.*` keys: the learner sees Dashboard, Course, Badges,
 * Leaderboard, Profile; the teacher sees Dashboard, Review Queue, Profile;
 * the admin sees Dashboard, Course / Publication, User list, Audit stream,
 * Provision roster, Export, Health, Profile.
 */
const NAV_BY_ROLE = {
  learner: ['home', 'course', 'badges', 'leaderboard', 'profile'] as string[],
  teacher: ['home', 'reviewQueue', 'profile'] as string[],
  admin: ['home', 'coursePublication', 'adminUsers', 'adminAudit', 'adminProvisioning', 'adminExport', 'health', 'profile'] as string[],
}

/** The Shell's nav shows EXACTLY the session role's destinations — asserted
 * on the NAV LANDMARK itself (never body text: a page's own copy may repeat a
 * label, the landmark cannot lie about which links the Shell renders). The
 * link count is the exactness gate: the learner's five, the teacher's three,
 * the admin's eight — nothing another-role's destination renders. */
export async function expectShellNav(page: Page, locale: string, role: 'learner' | 'teacher' | 'admin') {
  const nav = page.getByRole('navigation', { name: t(['shell', 'navLabel'], locale) })
  await expect(nav).toBeVisible()
  for (const key of NAV_BY_ROLE[role]) {
    await expect(nav.getByRole('link', { name: t(['nav', key], locale), exact: true })).toBeVisible()
  }
  await expect(nav.getByRole('link')).toHaveCount(NAV_BY_ROLE[role].length)
}

/**
 * PPGA #41 stage 1: the login/logout standalone 8-bit title screen OUTSIDE the
 * Shell frame — the journey's observable proof rides the LANDMARKS: the
 * title-screen copy (`shell.identity` + `shell.start`) is present while the
 * Shell's landmarks are ABSENT — no `navigation` landmark named
 * `shell.navLabel`, no `contentinfo` footer (the logout page's copy may
 * contain words like "profile" verbatim, so a body-text absence check would
 * be a false alarm — the landmark is the honest observable).
 */
export async function expectStandaloneScreen(page: Page, locale: string) {
  await expect(page.locator('body')).toContainText(t(['shell', 'start'], locale))
  await expect(page.locator('body')).toContainText(t(['shell', 'identity'], locale))
  await expect(page.getByRole('navigation', { name: t(['shell', 'navLabel'], locale) })).toHaveCount(0)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
}
