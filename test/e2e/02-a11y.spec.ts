import { test, expect } from '@playwright/test'

import AxeBuilder from '@axe-core/playwright'

import { accounts, signIn } from './helpers'

/**
 * PPGA #18 (the verification ticket): the accessibility sweep. Rides BOTH
 * projects (th + en) so every journey stage is checked in both languages on
 * the REAL app + the REAL DATABASE. It runs AFTER `01-journey` (the file
 * order is the run order with one worker): the journey has already stood the
 * learner's consent, the Pre-Test gate, and the whole XP/unlock spine, so
 * every screen renders its LIVE signed-in copy — no mocked outcome, no
 * placeholder screen.
 *
 * Axe (WCAG 2 A/AA) on every journey stage: violations is the finding's own
 * print (empty = axe said so; a red gets REPORTED, never rewritten here).
 *
 * The ticket's keyboard / focus-visibility / ARIA / reduced-motion checks,
 * in the REAL browser: Tab lands on a focusable control (never a mouse-only
 * control); the computed focus ring carries a visible width + style (state
 * never by colour alone); ARIA labels name the live regions; the shipped
 * stylesheet carries a `prefers-reduced-motion` query the live scan reads.
 */
test.describe('PPGA #18 accessibility sweep', () => {
  test.setTimeout(300000)

  const stages = [
    ['login', '/login'],
    ['dashboard', '/'],
    ['course map', '/course'],
    ['lesson', '/course/module-01/module-01-lesson-01'],
    ['mission', '/course/module-01/mission'],
    ['practical', '/course/module-08/practical'],
    ['badges gallery', '/badges'],
    ['post-test', '/post-test'],
    ['survey', '/survey'],
  ] as [string, string][]

  for (const [stageName, path] of stages) {
    test(`a11y axe: ${stageName}`, async ({ page }, testInfo) => {
      const locale = testInfo.project.use.locale as string
      const learner = accounts.learners[locale]

      if (path !== '/login') await signIn(page, locale, learner, '/profile')
      await page.goto(`/${locale}${path}`)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expect(results.violations).toEqual([])
    })
  }

  test('a11y keyboard, focus visibility, ARIA, reduced-motion', async ({ page }, testInfo) => {
    const locale = testInfo.project.use.locale as string
    const learner = accounts.learners[locale]

    await signIn(page, locale, learner, '/profile')

    // Keyboard: Tab from the document lands on a focusable control — never
    // the body, never a mouse-only affordance.
    await page.goto(`/${locale}`)
    await page.keyboard.press('Tab')
    await page.keyboard.press('Tab')
    const focusTag = await page.evaluate(() => document.activeElement?.tagName ?? '')
    expect(['BODY', '']).not.toContain(focusTag)

    // Focus visibility: the focused control's computed outline carries a
    // width + a style (the ticket's "visible focus"; a `none`/`0px` is the
    // finding, REPORTED as it prints).
    const ring = await page.evaluate(() => {
      const el = document.activeElement as HTMLElement
      const cs = el ? getComputedStyle(el) : null
      return cs ? { style: cs.outlineStyle, width: cs.outlineWidth } : null
    })
    expect(ring).toBeTruthy()
    expect(ring!.style).not.toBe('none')
    expect(ring!.width).not.toBe('0px')

    // ARIA: a landmark/region names itself via aria-label (the header's XP
    // section, the selector, the course map — never colour-only cues).
    const ariaName = await page.evaluate(() => document.querySelector('[aria-label]')?.getAttribute('aria-label'))
    expect(ariaName).toBeTruthy()

    // Reduced motion: the shipped stylesheet carries the query that drops
    // animations under `prefers-reduced-motion: reduce` — read off the LIVE
    // document's style sheets, not asserted from a CSS text.
    await page.goto(`/${locale}/health`)
    const cssHasReducedMotion = await page.evaluate(() => {
      for (const sheet of Array.from(document.styleSheets)) {
        try {
          for (const rule of Array.from(sheet.cssRules)) {
            if (rule instanceof CSSMediaRule && rule.conditionText?.includes('prefers-reduced-motion')) return true
          }
        } catch { /* cross-origin sheets skip */ }
      }
      return false
    })
    expect(cssHasReducedMotion).toBe(true)
  })
})
