import { test, expect, type Page } from '@playwright/test'

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
    ['module hub', '/course/module-01'],
    ['lesson', '/course/module-01/module-01-lesson-01'],
    ['mission', '/course/module-01/mission'],
    ['practical', '/course/module-08/practical'],
    ['review', '/course/module-08/review'],
    ['badges gallery', '/badges'],
    ['post-test', '/post-test'],
    ['survey', '/survey'],
  ] as [string, string][]

  // PPGA #46: the Shell's role framing in BOTH locales — the teacher's queue
  // and the admin's roster ride the same Shell (the journey proves the nav
  // CONTENT for each role; this proves the frame itself is axe-clean under
  // the teacher's/admin's session, all three roles × th + en).
  const roleStages = [
    ['teacher shell', '/teacher/review', accounts.teacher],
    ['admin shell', '/admin/users', accounts.admin],
  ] as [string, string, string][]

  /**
   * PPGA #50 / ADR-0004 + #51: the V3 palette is the owner-authored design
   * (the design sheet's own `:root` values ride under the unchanged token
   * names), and a few of its marks sit below the AA ratio the #18 sweep
   * asserted against the OLD palette:
   * - the LOCKED badge card (`Card[data-ppg-state=locked]`): `--ppg-status-locked`
   *   `#99a3b0` on `--ppg-gray-100` `#f1f3f6` = 2.29 (needs 3 at 24pt bold),
   *   and that ONE foreground paints BOTH of its text nodes — the heading
   *   (`h1.ppg-heading`) and the criteria body (`p.ppg-card-text`). #50's pair,
   *   still live; the dump on this branch confirms those two classes are the
   *   ONLY violators, and ONLY on locked cards (every available/warning/error
   *   card clears AA, so these classes cannot fire off a locked card today);
   * - the pixel wordmark (`.ppg-logo` header, 20px display; `.ppg-title-h1`
   *   title screens, 44px): `--ppg-pink-300` `#ff6da0` on `#fff` = 2.64, the
   *   design sheet's SHADOWED logo — #51's pair. Today the text-shadow makes
   *   axe report it `incomplete` (never a violation), so the fragment matches
   *   nothing yet; it stays a documented allowance the moment the shadow drops
   *   (the #50 login-CTA 3.16 pair likewise died to the CTA's gradient face —
   *   axe reports gradients as incomplete, never a violation).
   * #50's AC keeps the ramp exactly as the owner authored it ("tests updated
   * to the new tokens"), so the sweep's baseline moves to the V3 surfaces —
   * scoped NODE-precisely now: `color-contrast` may only fire on nodes whose
   * OWN markup carries one of the class names below (any other node, or any
   * other rule, on ANY stage, stays zero like before). A V3 re-tune that
   * clears these pairs makes the allowance dead code the next ticket deletes.
   * Matching is on `node.html` (the real class attribute), NOT the generated
   * `node.target` selector: axe picks the shortest selector that uniquely
   * resolves, so a lone locked-card node emits `…section > h1` /
   * `…section > .ppg-card-text` and may DROP the class — and it resolves
   * through DIFFERENT ancestors per locale (the th run through the locked
   * `.ppg-card[data-ppg-state]`, the en run through the `section[aria-label]`),
   * so a `target`-only match is both incomplete and locale-fragile. The class
   * names below are dot-free: they hit `html`'s `class="… ppg-card-text …"`
   * AND substring-match the dotted form when axe does emit it in a `target`.
   */
  const V3_CONTRAST_NODES = ['ppg-heading', 'ppg-card-text', 'ppg-logo', 'ppg-title-h1']

  /** The sweep's gate for ONE analyze() result. */
  function expectAxeV3Clean(results: Awaited<ReturnType<AxeBuilder['analyze']>>) {
    expect(results.violations.filter((v) => v.id !== 'color-contrast')).toEqual([])
    for (const violation of results.violations.filter((v) => v.id === 'color-contrast')) {
      for (const node of violation.nodes) {
        expect(
          V3_CONTRAST_NODES.some((fragment) => node.html.includes(fragment) || node.target.some((selector) => selector.includes(fragment))),
          `color-contrast node ${JSON.stringify({ target: node.target, html: node.html })} is not a V3-allowed surface`,
        ).toBe(true)
      }
    }
  }

  for (const [stageName, path] of stages) {
    test(`a11y axe: ${stageName}`, async ({ page }, testInfo) => {
      const locale = testInfo.project.use.locale as string
      const learner = accounts.learners[locale]

      if (path !== '/login') await signIn(page, locale, learner, '/profile')
      await page.goto(`/${locale}${path}`)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expectAxeV3Clean(results)
    })
  }

  for (const [stageName, path, identifier] of roleStages) {
    test(`a11y axe: ${stageName}`, async ({ page }, testInfo) => {
      const locale = testInfo.project.use.locale as string

      await signIn(page, locale, identifier, '/profile')
      await page.goto(`/${locale}${path}`)
      const results = await new AxeBuilder({ page }).withTags(['wcag2a', 'wcag2aa']).analyze()
      expectAxeV3Clean(results)
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

  /*
   * PPGA #46 (the Shell epic's final sweep): the ticket's keyboard AC read
   * literally — EVERY nav item, the COLLAPSED-MENU items, and a destination,
   * all reached by Tab/Enter with a VISIBLE ring checked AT EACH stop (the
   * computed outline of the element the focus actually landed on, never a
   * pre-picked selector). The Shell header's DOM order puts the nav first,
   * so the walk is short and its coverage is the nav landmark itself.
   */

  /** One live Tab stop: the focused element's tag/id, the pathname it points
   * at (links only), and its COMPUTED focus ring at that moment. */
  interface Stop {
    tag: string
    id: string
    path: string
    ringStyle: string
    ringWidth: string
  }
  async function focusStop(page: Page): Promise<Stop | null> {
    return page.evaluate(() => {
      const el = document.activeElement as HTMLElement | null
      if (!el) return null
      const cs = getComputedStyle(el)
      return {
        tag: el.tagName,
        id: el.id,
        path: el instanceof HTMLAnchorElement ? new URL(el.href).pathname : '',
        ringStyle: cs.outlineStyle,
        ringWidth: cs.outlineWidth,
      }
    })
  }
  const hasVisibleRing = (s: Stop): boolean => s.ringStyle !== 'none' && s.ringWidth !== '0px'

  /** Tab repeatedly, recording (per wanted link pathname) whether its focus
   * stop carried a visible ring. Returns pathname -> ring-visible (missing =
   * never focused at all within the cap). */
  async function tabWalk(page: Page, wanted: string[], maxStops = 60): Promise<Record<string, boolean>> {
    const wantedSet = new Set(wanted)
    const focused: Record<string, boolean> = {}
    for (let i = 0; i < maxStops && Object.keys(focused).length < wantedSet.size; i++) {
      await page.keyboard.press('Tab')
      const stop = await focusStop(page)
      if (stop && stop.path && wantedSet.has(stop.path)) focused[stop.path] = hasVisibleRing(stop)
    }
    return focused
  }

  /** Tab until a stop matches, returning it (null = never, within the cap). */
  async function tabUntil(page: Page, matches: (s: Stop) => boolean, maxStops = 60): Promise<Stop | null> {
    for (let i = 0; i < maxStops; i++) {
      await page.keyboard.press('Tab')
      const stop = await focusStop(page)
      if (stop && matches(stop)) return stop
    }
    return null
  }

  /** The Shell nav landmark's link pathnames (the learner's five). */
  async function navPaths(page: Page): Promise<string[]> {
    return page.evaluate(() =>
      Array.from(document.querySelectorAll('nav a')).map((a) => new URL((a as HTMLAnchorElement).href).pathname))
  }

  test('a11y keyboard: every Shell nav item is Tab-reachable with visible focus; Enter reaches the destination', async ({ page }, testInfo) => {
    const locale = testInfo.project.use.locale as string

    await signIn(page, locale, accounts.learners[locale], '/profile')
    await page.goto(`/${locale}`)

    const paths = await navPaths(page)
    expect(paths).toHaveLength(5)

    const focused = await tabWalk(page, paths)
    for (const path of paths) {
      expect(focused[path], `nav item ${path} never received visible keyboard focus`).toBe(true)
    }

    // Destination: Tab to the Course link (wrapping the document if needed),
    // Enter follows it — the keyboard user lands exactly where the link says.
    const coursePath = `/${locale}/course`
    const stop = await tabUntil(page, (s) => s.path === coursePath)
    expect(stop).toBeTruthy()
    expect(hasVisibleRing(stop!)).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${locale}/course$`))
  })

  test('a11y keyboard: the collapsed 360px menu opens by keyboard; every item visible focus; Enter reaches a destination', async ({ page }, testInfo) => {
    const locale = testInfo.project.use.locale as string

    await signIn(page, locale, accounts.learners[locale], '/profile')
    await page.setViewportSize({ width: 360, height: 640 })
    await page.goto(`/${locale}`)

    const paths = await navPaths(page)
    expect(paths).toHaveLength(5)

    // The collapsed menu hides its links with `display: none` (never
    // Tab-trappable) — the toggle is the menu's keyboard affordance; Tab
    // must land on it, with the ring.
    const toggle = page.locator('#ppg-menu-toggle')
    await expect(toggle).toBeVisible()
    await expect(toggle).toHaveAttribute('aria-expanded', 'false')
    const onToggle = await tabUntil(page, (s) => s.id === 'ppg-menu-toggle')
    expect(onToggle).toBeTruthy()
    expect(hasVisibleRing(onToggle!)).toBe(true)

    // Enter opens it (the native button's own keyboard behavior).
    await page.keyboard.press('Enter')
    await expect(toggle).toHaveAttribute('aria-expanded', 'true')

    // Every menu item is now a real Tab stop with the visible ring.
    const focused = await tabWalk(page, paths)
    for (const path of paths) {
      expect(focused[path], `collapsed-menu item ${path} never received visible keyboard focus`).toBe(true)
    }

    // And a destination is reached from INSIDE the opened menu.
    const coursePath = `/${locale}/course`
    const stop = await tabUntil(page, (s) => s.path === coursePath)
    expect(stop).toBeTruthy()
    expect(hasVisibleRing(stop!)).toBe(true)
    await page.keyboard.press('Enter')
    await expect(page).toHaveURL(new RegExp(`/${locale}/course$`))
  })

  test('a11y reduced-motion: the HUD XP fill + the stage progress fill drop their motion under reduce', async ({ page }, testInfo) => {
    const locale = testInfo.project.use.locale as string

    await signIn(page, locale, accounts.learners[locale], '/profile')
    await page.emulateMedia({ reducedMotion: 'reduce' })

    // The ONLY animated surfaces the platform ships are the XP/progress
    // fills (inline stepped `width` transitions) — under the emulated media
    // the COMPUTED duration must read 0s on the live document (the Shell
    // HUD's bar on the dashboard, the stage map's progress on /course).
    await page.goto(`/${locale}`)
    const xpFill = page.locator('.ppg-xp-fill').first()
    await expect(xpFill).toBeAttached()
    expect(await xpFill.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')

    await page.goto(`/${locale}/course`)
    const barFill = page.locator('.ppg-progress-fill').first()
    await expect(barFill).toBeAttached()
    expect(await barFill.evaluate((el) => getComputedStyle(el).transitionDuration)).toBe('0s')
  })
})
