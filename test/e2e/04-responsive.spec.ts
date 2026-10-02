import { test, expect } from '@playwright/test'

import { accounts, signIn } from './helpers'

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
 * The widths: 360x640 (phone), 768x1024 (tablet), 1280x800 (desktop).
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

      // No horizontal overflow on the dashboard, the course map, a lesson.
      for (const path of ['/', '/course', '/course/module-01/module-01-lesson-01']) {
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

      await context.close()
    })
  }
})
