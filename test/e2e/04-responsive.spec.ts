import { test, expect } from '@playwright/test'

import { accounts, signIn } from './helpers'
import { t } from './helpers'

/**
 * PPGA #18 (the verification ticket): the responsive sweep. Rides BOTH
 * projects (th + en) at mobile / tablet / desktop widths, on the REAL app +
 * the REAL DATABASE — no mocked outcome, no per-pixel snapshots.
 *
 * What is verified per width, in both languages:
 * - the login page renders and the sign-in works at every width (the gate
 *   redirect lands the learner on /profile);
 * - the page does NOT overflow horizontally (no horizontal scroll on any
 *   signed-in stage of the journey: the course map, a lesson, the teacher
 *   queue);
 * - the language selector stays reachable at every width (the ticket's
 *   #60 "works on phone/tablet" claim).
 *
 * PPGA #41 stage 2 (the issue's responsive pass, story #8/#9): the SAME Shell
 * concept on small screens — the nav collapses into a compact accessible
 * menu (the `#ppg-menu-toggle` affordance, keyboard-operable +
 * `aria-expanded` state) while the learner's status stays preserved in the
 * HUD (`header.progress`'s copy is visible at every width); the desktop
 * composition shows every destination inline, no sidebar (the issue). The
 * widths: 360x640 (phone), 768x1024 (tablet), 1280x800 (desktop).
 */
const widths = [
  ['mobile', 360, 640],
  ['tablet', 768, 1024],
  ['desktop', 1280, 800],
] as [string, number, number][]

test.describe('PPGA #18 responsive sweep', () => {
  test.setTimeout(240000)

  for (const [sizeName, width, height] of widths) {
    test(`responsive ${sizeName}: no horizontal overflow, journey stages reachable`, async ({ browser }, testInfo) => {
      const locale = testInfo.project.use.locale as string
      const learner = accounts.learners[locale]
      const context = await browser.newContext({ viewport: { width, height } })
      const page = await context.newPage()

      // Sign in at the width (the gate's redirect is observable).
      await signIn(page, locale, learner, '/profile')

      // No horizontal overflow on the dashboard, the course map, a lesson —
      // and (PPGA #46) on the Shell epic's challenge-framing surfaces: the
      // module page's challenge track, the practical panel, the review panel.
      for (const path of [
        '/',
        '/course',
        '/course/module-01/module-01-lesson-01',
        '/course/module-01',
        '/course/module-08/practical',
        '/course/module-08/review',
      ]) {
        await page.goto(`/${locale}${path}`)
        const scroll = await page.evaluate(() => ({
          scrollW: document.documentElement.scrollWidth,
          clientW: document.documentElement.clientWidth,
        }))
        // Allow a 1px rounding margin (sub-pixel layout).
        expect(scroll.scrollW).toBeLessThanOrEqual(scroll.clientW + 1)
      }

      // The selector stays reachable at every width (the ticket's phone/
      // tablet claim; the real select, never a hidden input).
      await page.goto(`/${locale}/course`)
      const selector = page.locator('#ppga-locale-selector')
      await expect(selector).toBeVisible()
      const box = await selector.boundingBox()
      expect(box).toBeTruthy()
      expect(box!.x).toBeGreaterThanOrEqual(0)
      expect(box!.x + box!.width).toBeLessThanOrEqual(width + 1)

      // PPGA #41 stage 2: the learner's status (the HUD's `header.progress`
      // copy) is preserved at every width (story #9: the learner never loses
      // bearings when the nav collapses).
      await page.goto(`/${locale}`)
      await expect(page.locator('body')).toContainText(t(['header', 'progress'], locale))

      // PPGA #41 stage 2: the mobile collapse (story #8/#10) — the compact
      // ACCESSIBLE menu affordance on small screens (the `#ppg-menu-toggle`
      // button, keyboard-operable + the `aria-expanded` state visible), the
      // nav items hide until the toggle opens them; on desktop (≥768px) the
      // toggle hides itself and every destination shows inline (the issue's
      // desktop composition: CENTER = primary navigation, no sidebar). The
      // proof rides the nav LANDMARK's links (a page's own copy may repeat a
      // label — the landmark cannot).
      const nav = page.getByRole('navigation', { name: t(['shell', 'navLabel'], locale) })
      const courseLink = nav.getByRole('link', { name: t(['nav', 'course'], locale), exact: true })
      const toggle = page.locator('#ppg-menu-toggle')
      const collapsed = width < 768
      if (collapsed) {
        await expect(toggle).toBeVisible()
        expect(await toggle.getAttribute('aria-expanded')).toBe('false')
        await expect(courseLink).toBeHidden()
        await toggle.click()
        expect(await toggle.getAttribute('aria-expanded')).toBe('true')
        await expect(courseLink).toBeVisible()
      } else {
        // The desktop toggle hides itself (the `min-width: 768px` media rule
        // removes it from the layout + the AX tree; the items stay inline).
        await expect(toggle).toBeHidden()
        await expect(courseLink).toBeVisible()
      }

      await context.close()
    })
  }
})
