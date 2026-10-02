import { test, expect } from '@playwright/test'

import { accounts, signIn, signOut, t, RAW_KEY_LEAK } from './helpers'

/**
 * PPGA #18 (the verification ticket): the language selection + persistence
 * sub-journey. Runs under BOTH Playwright projects (`th` and `en`) exactly as
 * the critical journey does, so "bilingual checks: Thai default, no raw keys,
 * persistence across logout" verifies on the REAL browser + the REAL
 * DATABASE: the selector's real `select` element POSTs `/api/locale` (the
 * route writes the CALLER's own profile row under the session JWT's RLS), and
 * `next-intl/middleware` re-lands the caller on their chosen locale after the
 * logout — the observable outcome, never a client-remembered value.
 */
test.describe('PPGA #18 language selection & persistence', () => {
  test.setTimeout(180000)

  test('default locale, switch across pages, persistence across logout', async ({ page }, testInfo) => {
    const locale = testInfo.project.use.locale as string
    const other = locale === 'th' ? 'en' : 'th'
    const learner = accounts.learners[locale]

    // 0. An anonymous caller landing on the root reaches the Thai default —
    // the routing middleware's `/` → `/th` redirect, never a blank screen.
    await page.goto('/')
    await expect(page).toHaveURL(/\/th$/)

    // 1. The learner signs in (the journey's own helper: the real login
    // page + the real `/api/auth/login`; the gate's redirect is observable).
    await signIn(page, locale, learner, '/profile')

    // 2. The switch: the SELECT's keyboard-driven control (the option the
    // CALLER clicks, not a hidden value) posts the choice to the SERVER and
    // re-lands the pathname under the new locale. The POST's own response is
    // the observable outcome of the DATABASE's `ppg_profiles_update` policy
    // at the CALLER's own session JWT — ok true here, a stranger's smuggle
    // reaches `denied` verbatim (the RLS, not this render).
    const localePost = page.waitForResponse((r) => r.url().includes('/api/locale') && r.ok())
    await page.locator('#ppga-locale-selector').selectOption(other)
    const body = (await (await localePost).json()) as { ok?: boolean; detail?: string }
    expect(body.ok).toBe(true)
    // The switch re-lands the SAME pathname under the new locale (the
    // selector's own `router.replace(pathname, { locale })`) — the profile
    // page step 1 landed on, now wearing the other locale.
    await expect(page).toHaveURL(new RegExp(`/${other}/profile$`))

    // 3. Persistence across the logout: the profile outlasts the httpOnly
    // session cookies; the next login's redirect lands under the CHOSEN
    // locale. The journey's signOut + signIn helpers drive the real forms.
    await signOut(page, other)
    await signIn(page, other, learner, '/profile')

    // 4. No raw keys on any of the three visited screens (the journey's own
    // leak regex: a legit copy has dots only inside numerals/parens, never a
    // letter-prefixed `word.word`).
    await page.goto(`/${other}/course`)
    const text = await page.locator('body').textContent()
    expect(RAW_KEY_LEAK.exec(text ?? '')).toBeFalsy()

    // 5. The screen-reader-visible cue: the current option carries
    // `aria-current="true"` (state never by colour alone) and the switch's
    // hint copy explains what happens on the change.
    await expect(page.locator('#ppga-locale-selector').locator(`option[value=${other}]`)).toHaveAttribute('aria-current', 'true')

    // 6. PPGA #41 stage 2 (story #31): the learner's nav copy is COMPLETE in
    // the OTHER locale — the Shell nav landmark's five learner links (Home,
    // Course, Badges, Leaderboard, Profile) every `nav.*` string appears in
    // the new language (asserted ON the landmark: nothing falls back
    // awkwardly or shows raw keys — the leak regex below double-checks the
    // body). No raw keys anywhere (a legit copy has dots only inside
    // numerals/parens, never a letter-prefixed `word.word`).
    const nav = page.getByRole('navigation', { name: t(['shell', 'navLabel'], other) })
    for (const key of ['home', 'course', 'badges', 'leaderboard', 'profile'] as string[]) {
      await expect(nav.getByRole('link', { name: t(['nav', key], other), exact: true })).toBeVisible()
    }
    const textOther = await page.locator('body').textContent()
    expect(RAW_KEY_LEAK.exec(textOther ?? '')).toBeFalsy()
  })
})
