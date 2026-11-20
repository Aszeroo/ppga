import path from 'node:path'

import { execSync } from 'node:child_process'

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

/** The clean copy lookup, then the `{name}` placeholders the pages fill. */
export function tFormat(path: string[], locale: string, values: Record<string, string | number>): string {
  let copy = t(path, locale)
  for (const [key, value] of Object.entries(values)) copy = copy.replaceAll(`{${key}}`, String(value))
  return copy
}

/** The raw-key-leak regex: the key namespace + a dot + a letter/dot tail.
 * The legit copy has dots only inside numerals/parens (`(8.1-8.4)`,
 * `Total 28 / 35`) — never a letter-prefixed `word.word`. Ticket #46 adds the
 * Shell epic's namespaces (`shell`/`nav`/`challenge`) — the Shell frame + the
 * stage/challenge framing ride EVERY signed-in page, so their keys leak there
 * first. */
export const RAW_KEY_LEAK = /(?:login|logout|home|course|pretest|posttest|survey|lesson|selfcheck|mission|practical|review|header|leaderboard|badges|gallery|profile|change|admin|content|health|shell|nav|challenge)\.[a-z.]+/i

export const accounts = {
  admin: 'admin',
  teacher: 'teacher',
  learners: { th: '64110001', en: '64110002' } as Record<string, string>,
}

/** The seeded display names (the leaderboard rows print them). */
export const LEARNER_NAME = { th: 'Learner One', en: 'Learner Two' } as Record<string, string>

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
  // The page then assigns `window.location.href = result.redirect`; wait for
  // the real navigation to leave `/logout` so the next `goto` never aborts a
  // navigation still in flight (PPGA #99 flake: `net::ERR_ABORTED`).
  await page.waitForURL((url) => !url.pathname.endsWith('/logout'), { timeout: 30000 })
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

/**
 * The award the real record shows. PPGA #51: the V3 HUD is chip-only (XP +
 * LV — the header never shows badges), so the earned badge's observable is
 * the dashboard hub's badge row: the `header.badge` copy line + the award
 * row's own `badge_key` marker (`[data-ppg-badge]`, the `data-ppg-xp-event`
 * PK-marker idiom). The count-1 check keeps the once-per-learner authority
 * gate (the award PK renders exactly once).
 */
export async function expectBadge(page: Page, locale: string, badgeKey: string) {
  const hub = page.locator('[data-ppg-hub="status"]')
  await expect(hub).toContainText(t(['header', 'badge'], locale))
  await expect(hub.locator(`[data-ppg-badge="${badgeKey}"]`)).toHaveCount(1)
}

/** The XP + Level the gamified spine shows on the signed-in learner. The
 * header prints the learner's XP over the level threshold (level N ends at
 * N*100 XP), so `xpToNext` (the remaining XP) is added back to get it. */
export async function expectXpLine(page: Page, xp: number, xpToNext: number) {
  await expect(page.locator('body')).toContainText(`${xp} / ${xp + xpToNext}`)
}

/**
 * PPGA #41 stage 4: the XP reward chip the REAL ledger row makes visible —
 * pinned by the ledger's own PK marker (`data-ppg-xp-event="event_type:
 * event_ref"`), showing the row's own `+N XP`. The chip renders ONLY where
 * a real grant landed, so the count-1 assertion is also the exactly-once
 * gate: a granted XP never renders twice, and an absent grant renders
 * nothing (the journey pairs it with a zero-count check pre-pass).
 */
export async function expectXpChip(page: Page, eventAttr: string, amount: number) {
  const chip = page.locator(`[data-ppg-xp-event="${eventAttr}"]`)
  await expect(chip).toHaveCount(1)
  await expect(chip).toContainText(`+${amount} XP`)
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
 * Leaderboard, Profile; the teacher sees Dashboard, Chapter progress,
 * Profile; the admin sees Dashboard, Chapter progress, Course / Publication,
 * User list, Audit stream, Provision roster, Export, Health, Profile.
 */
const NAV_BY_ROLE = {
  learner: ['home', 'course', 'badges', 'leaderboard', 'profile'] as string[],
  teacher: ['home', 'progress', 'students', 'attendance', 'profile'] as string[],
  admin: ['home', 'progress', 'attendance', 'coursePublication', 'adminUsers', 'adminAudit', 'adminProvisioning', 'adminExport', 'health', 'profile'] as string[],
}

/** The Shell's nav shows EXACTLY the session role's destinations — asserted
 * on the NAV LANDMARK itself (never body text: a page's own copy may repeat a
 * label, the landmark cannot lie about which links the Shell renders). The
 * link count is the exactness gate: the learner's five, the teacher's five,
 * the admin's ten — nothing another-role's destination renders. */
export async function expectShellNav(page: Page, locale: string, role: 'learner' | 'teacher' | 'admin') {
  const nav = page.getByRole('navigation', { name: t(['shell', 'navLabel'], locale) })
  await expect(nav).toBeVisible()
  for (const key of NAV_BY_ROLE[role]) {
    await expect(nav.getByRole('link', { name: t(['nav', key], locale), exact: true })).toBeVisible()
  }
  await expect(nav.getByRole('link')).toHaveCount(NAV_BY_ROLE[role].length)
}

/**
 * PPGA #49 (the V3 design-fidelity pass): the login/logout STANDALONE title
 * screens outside the Shell frame — the observable proof rides the LANDMARKS
 * and the card's OWN copy: the pixel `PPGA` wordmark (the design's title
 * screen heading, `shell.logo`) is present while the Shell's landmarks are
 * ABSENT — no `navigation` landmark named `shell.navLabel`, no `contentinfo`
 * footer, and no mobile menu toggle (the `#ppg-menu-toggle` `☰` button lives
 * inside the framed header's `Nav`, so it can NEVER float over a title
 * screen; the owner's preview review flagged exactly that). The design's
 * `.lang-sw` switch IS on the card (the `selector.label` nav landmark, never
 * the frame's) — the language choice works from the title screens too.
 */
export async function expectStandaloneScreen(page: Page, locale: string) {
  await expect(page.getByRole('heading', { level: 1, name: t(['shell', 'logo'], locale) })).toBeVisible()
  await expect(page.getByRole('navigation', { name: t(['shell', 'navLabel'], locale) })).toHaveCount(0)
  await expect(page.getByRole('contentinfo')).toHaveCount(0)
  await expect(page.locator('#ppg-menu-toggle')).toHaveCount(0)
  await expect(page.locator('#ppga-locale-selector')).toBeVisible()
}

/**
 * PPGA #99: the local-stack database seam, the SAME `docker exec
 * supabase_db_ppga psql -U postgres -tA` pattern the `test/seam/*` suites
 * already use. The e2e journey drives the REAL UI + the REAL API routes; this
 * helper only (a) reads seed-owned answer keys the browser is never allowed
 * to see, so the journey can answer instruments as a learner would, and
 * (b) writes the explicit fixture that seeds chapters 2-9 (below). Product
 * outcomes are never mocked: every score, XP grant, unlock and badge in the
 * journey still comes from the shipped RPC under the learner's own JWT.
 */
const DB_CONTAINER = 'supabase_db_ppga'

export function dbQuery(sql: string): string {
  return execSync(`docker exec -i ${DB_CONTAINER} psql -U postgres -tA`, {
    input: sql,
    encoding: 'utf8',
  }).trim()
}

function parseAnswerKey(sql: string): Record<string, string> {
  const raw = dbQuery(sql)
  if (!raw) throw new Error('answer key query returned no row')
  return JSON.parse(raw) as Record<string, string>
}

/** The global research pre-test key (`item_<n>` -> A/B/C/D), server-side only. */
export function pretestAnswerKey(version = '2026.11.1'): Record<string, string> {
  return parseAnswerKey(
    `select answer_key::text from public.ppg_pretest_instruments where version = '${version}';`,
  )
}

/** The Final Test key (`item_<n>` -> A/B/C/D), server-side only. */
export function posttestAnswerKey(version = '2026.11.1'): Record<string, string> {
  return parseAnswerKey(
    `select answer_key::text from public.ppg_posttest_instruments where version = '${version}';`,
  )
}

/** One chapter bank's key (`<order_index>` -> a/b/c), server-side only. */
export function chapterTestAnswerKey(chapterKey: string, phase: 'pre' | 'post'): Record<string, string> {
  return parseAnswerKey(
    `select coalesce(jsonb_object_agg(order_index, option_key), '{}'::jsonb)::text
       from public.ppg_chapter_test_questions
      where chapter_key = '${chapterKey}' and phase = '${phase}' and is_correct;`,
  )
}

/** One Knowledge Mission's key (`<order_index>` -> a/b/c), server-side only. */
export function missionAnswerKey(moduleKey: string): Record<string, string> {
  return parseAnswerKey(
    `select coalesce(jsonb_object_agg(order_index, option_key), '{}'::jsonb)::text
       from public.ppg_knowledge_mission_questions
      where module_key = '${moduleKey}' and is_correct;`,
  )
}

/** One lesson's mini-check keys (`<step_order_index>` -> a/b/c/d). */
export function lessonCheckAnswerKey(lessonKey: string): Record<string, string> {
  return parseAnswerKey(
    `select coalesce(jsonb_object_agg(order_index, check_answer_key), '{}'::jsonb)::text
       from public.ppg_lesson_steps
      where lesson_key = '${lessonKey}' and kind = 'check';`,
  )
}

/**
 * Normalise a key into the form the UI posts: `item_1` .. `item_<count>`.
 * Chapter tests key their answer object by bare `order_index`, the
 * instruments by `item_<n>`; both collapse to the same answer object here.
 */
export function answersFromKey(key: Record<string, string>, count = Object.keys(key).length): Record<string, string> {
  const answers: Record<string, string> = {}
  for (let n = 1; n <= count; n++) answers[`item_${n}`] = key[`item_${n}`] ?? key[String(n)] ?? ''
  return answers
}

/** Any option letter different from the correct one (the fail-path answer). */
export function wrongOption(correct: string): string {
  return ['a', 'b', 'c', 'd'].find((letter) => letter !== correct.toLowerCase()) ?? 'a'
}

/** A fully-wrong answer object for an instrument/bank key. */
export function wrongAnswersFromKey(key: Record<string, string>, count = Object.keys(key).length): Record<string, string> {
  const correct = answersFromKey(key, count)
  const wrong: Record<string, string> = {}
  for (let n = 1; n <= count; n++) wrong[`item_${n}`] = wrongOption(correct[`item_${n}`] ?? 'a')
  return wrong
}

/**
 * Fill every item of the pre-test / Final Test (`instrument-radio`, one
 * `input[name="item_<n>"][value="<UPPERCASE>"]` per item) or of a chapter bank
 * (`radio`, one `input[name="item_<n>"][value="<lowercase>"]` per question).
 * The letter always comes from the database key - no chapter item text is
 * ever hardcoded.
 */
export async function fillInstrument(
  page: Page,
  prefix: string,
  count: number,
  answers: Record<string, string>,
  kind: 'instrument-radio' | 'radio' = 'instrument-radio',
) {
  for (let n = 1; n <= count; n++) {
    const answer = answers[`item_${n}`]
    if (!answer) throw new Error(`fillInstrument: no answer for item ${n} (${prefix})`)
    if (kind === 'radio') {
      await page.locator(`input[name="item_${n}"][value="${answer.toLowerCase()}"]`).check()
    } else {
      // The instruments post the shipped A-D keys uppercased; the chapter
      // banks keep their own lowercase radio values.
      await page.locator(`input[name="item_${n}"][value="${answer.toUpperCase()}"]`).check()
    }
  }
}

/**
 * Submit a chapter pre/post-test. The route redirects the native form back to
 * the test screen (303), so the observable is the persisted receipt the next
 * read renders — never the POST body (the shipped pattern: the screen prints
 * the SERVER's decision).
 */
export async function submitChapterTest(page: Page, phase: 'pre' | 'post'): Promise<void> {
  const response = page.waitForResponse((r) => r.url().includes('/api/chapter-test/submit'))
  await page.locator(`form[data-ppg-chapter-test="${phase}"] button[type="submit"]`).click()
  await response
  await page.waitForLoadState()
}

/**
 * PPGA #99 TEST FIXTURE, NOT A PRODUCT CLAIM. The journey proves the whole
 * CAI loop on chapter-01 (both sides of the 70% gate); running all nine
 * chapters through the browser would only repeat the same proven loop. Under
 * the #86 rule the Final Test unlocks on NINE distinct `ppg_chapter_unlocks`
 * rows (chapter-02..chapter-10), so this seeds that fixture for the learner
 * whose chapter-01 pass already wrote the chapter-02 row. It deliberately
 * skips the chapters 2-9 UI loop; every Final Test outcome (score, XP,
 * badge, retries) is still the shipped RPC's own.
 */
export function seedChapterUnlocksFixture(learnerUuid: string, chapters: string[]): void {
  const rows = chapters
    .map((chapter) => `('${learnerUuid}', '${chapter}', 10, 10)`)
    .join(', ')
  dbQuery(
    `insert into public.ppg_chapter_unlocks (learner_id, chapter_key, unlocked_by_score, item_count)
     values ${rows}
     on conflict (learner_id, chapter_key) do nothing;`,
  )
}

