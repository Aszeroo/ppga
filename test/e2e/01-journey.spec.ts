import { test, expect, type Page } from '@playwright/test'

import {
  accounts,
  LEARNER_NAME,
  LEARNER_UUID,
  answersFromKey,
  chapterTestAnswerKey,
  expectBadge,
  expectShellNav,
  expectStandaloneScreen,
  expectXpLine,
  fillInstrument,
  lessonCheckAnswerKey,
  missionAnswerKey,
  posttestAnswerKey,
  pretestAnswerKey,
  RAW_KEY_LEAK,
  seedChapterUnlocksFixture,
  signIn,
  signOut,
  submitChapterTest,
  submitForm,
  t,
  tFormat,
  wrongAnswersFromKey,
  wrongOption,
} from './helpers'

/**
 * PPGA #99 (the CAI critical journey): consent → global 50-item research
 * pre-test → the chapter loop → the Final Test → the Satisfaction Survey,
 * through the REAL browser + the REAL database. One shard, two projects: the
 * `th` run drives Learner One (`64110001`), the `en` run Learner Two
 * (`64110002`), so both locales are green under the same spec.
 *
 * The journey proves the CAI loop on chapter-01 only — the 70% gate in BOTH
 * directions (a failing post-test does not unlock chapter-02, a passing retry
 * does), the three lessons with a correct AND an incorrect mini-check (which
 * never gate), the Knowledge Mission, the reward ledger and the exactly-once
 * badges. Chapters 2-9 are then seeded as an EXPLICIT fixture (see
 * `seedChapterUnlocksFixture`) because replaying the proven loop eight more
 * times through the browser would test nothing new; every Final Test outcome
 * still rides the shipped RPC.
 *
 * Assertions ride observable markers and server reads only: `data-ppg-*`
 * state nodes, the persisted receipt the submit screen re-reads, the header
 * XP total, the hub's real badge rows. Answer keys are read from the local
 * stack with the same `docker exec psql` seam the `test/seam/*` suites use —
 * the browser itself never sees a key.
 */
test.describe('PPGA #99 CAI critical journey', () => {
  test.setTimeout(420000)

  test('consent → research pre-test → chapter-01 loop (gate both ways) → Final Test → survey', async ({ page }, testInfo) => {
    const locale = testInfo.project.use.locale as string
    const learner = accounts.learners[locale]!
    const uuid = LEARNER_UUID[locale]!
    const learnerName = LEARNER_NAME[locale]!
    const rawLeakCheck = async (target: Page) => {
      const text = await target.locator('body').textContent()
      expect(RAW_KEY_LEAK.exec(text ?? '')).toBeFalsy()
    }
    const primaryCta = (target: Page) => target.locator('[data-ppg-cta="primary"]')
    const stageOf = (target: Page, moduleKey: string) =>
      target.locator(`[data-ppg-stage-module="${moduleKey}"]`)

    // The chapter-01 banks the journey answers (10 items each) and the
    // database keys behind them. Read once; the browser never sees a key.
    const chapterPreKey = chapterTestAnswerKey('chapter-01', 'pre')
    const chapterPostKey = chapterTestAnswerKey('chapter-01', 'post')
    const chapterCount = Object.keys(chapterPreKey).length
    expect(chapterCount).toBe(10)
    const chapterPreAnswers = answersFromKey(chapterPreKey, chapterCount)
    const chapterPostAnswers = answersFromKey(chapterPostKey, chapterCount)
    const chapterPostWrong = wrongAnswersFromKey(chapterPostKey, chapterCount)

    // 0. The anonymous caller reaches the standalone login title screen.
    await page.goto(`/${locale}/profile`)
    await expect(page).toHaveURL(RegExp(`/${locale}/login$`))
    await expect(page.locator('body')).toContainText(t(['login', 'submit'], locale))
    await rawLeakCheck(page)
    await expectStandaloneScreen(page, locale)

    // 1. A fresh learner without consent sees the respectful explanation and
    // the one primary CTA that speaks it; the Pre-Test pathname is denied.
    await signIn(page, locale, learner, '')
    await expect(page.locator('body')).toContainText(t(['home', 'states', 'noConsent'], locale))
    await expect(primaryCta(page)).toHaveText(t(['home', 'loop', 'consentCta'], locale))
    await expectShellNav(page, locale, 'learner')
    await page.goto(`/${locale}/pre-test`)
    await expect(page).toHaveURL(RegExp(`/${locale}/?$`))

    // 2. The Admin records the paper consent offline (the shipped console;
    // its own JWT is the gate's authority, a separate browser context keeps
    // the admin's cookies out of the learner's jar).
    const adminCtx = await page.context().browser()!.newContext()
    const admin = await adminCtx.newPage()
    await signIn(admin, locale, accounts.admin, '/profile')
    await admin.goto(`/${locale}/admin/users`)
    await expectShellNav(admin, locale, 'admin')
    await admin.locator('#admin_consent_target_id').fill(uuid)
    await admin.locator('#admin_consent_flag').selectOption('true')
    await submitForm(admin, '[data-ppg-admin-form=consent]', '/api/admin/consent', true)
    await adminCtx.close()

    // 3. Re-login re-reads the DATABASE's flags: consenting, un-submitted →
    // the login lands ONLY on the 50-item research Pre-Test.
    await signOut(page, locale)
    await signIn(page, locale, learner, '/pre-test')
    // The 50-item instrument's controls (the shared `itemsLabel` collides
    // with the gate section's name in `th`, so the control count is the
    // unambiguous observable).
    await expect(page.locator('input[name="item_1"]').first()).toBeVisible()
    await expect(page.locator('input[name="item_50"]').first()).toBeVisible()
    await expect(page.locator('[role="radiogroup"]')).toHaveCount(50)

    // 4. The global research pre-test: all 50 controls, scored SERVER-side
    // from the key the browser never sees. It grants no XP (ADR-0001).
    const pretestKey = pretestAnswerKey()
    expect(Object.keys(pretestKey).length).toBe(50)
    await fillInstrument(page, 'prettest', 50, pretestKey, 'instrument-radio')
    const pretest = await submitForm(page, '[data-ppg-pretest-form=prettest]', '/api/prettest/submit', true)
    expect(pretest.score).toBe(50)

    // The gate OPEN is a new login read (the cookies ride the login, not the
    // submit response — the shipped wire the production learner walks).
    await signOut(page, locale)
    await signIn(page, locale, learner, '/profile')

    // 5. The dashboard's ONE next action is the chapter-01 pre-test: the CAI
    // loop's entry point, linked from the server's own reads.
    await page.goto(`/${locale}`)
    await expect(primaryCta(page)).toHaveAttribute(
      'href',
      RegExp(`/${locale}/course/chapter-01/chapter-test/pre$`),
    )

    // 6. The Course map: nine chapters in order, chapter-01 open, 02-09
    // locked. No practical, upload or review destination anywhere.
    await page.goto(`/${locale}/course`)
    await expect(page.locator('[data-ppg-stage-module]')).toHaveCount(9)
    expect(
      await page.locator('[data-ppg-stage-module]').evaluateAll((nodes) =>
        nodes.map((node) => node.getAttribute('data-ppg-stage-module')),
      ),
    ).toEqual([
      'chapter-01', 'chapter-02', 'chapter-03', 'chapter-04', 'chapter-05',
      'chapter-06', 'chapter-07', 'chapter-08', 'chapter-09',
    ])
    await expect(stageOf(page, 'chapter-01')).toHaveAttribute('data-ppg-stage-state', 'open')
    await expect(page.locator('[data-ppg-stage-module][data-ppg-stage-state="locked"]')).toHaveCount(8)
    await expect(page.locator('[data-ppg-stage-module][data-ppg-stage-state="cleared"]')).toHaveCount(0)
    await expect(page.locator('[data-ppg-stage-direction="next"] a')).toHaveAttribute(
      'href',
      RegExp(`/${locale}/course/chapter-01$`),
    )
    await expect(page.locator('a[href*="practical"], a[href*="upload"], a[href*="review"]')).toHaveCount(0)
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
    await rawLeakCheck(page)

    // 7. The chapter-01 pre-test: ten items, one attempt (diagnostic, no XP).
    await page.goto(`/${locale}/course/chapter-01/chapter-test/pre`)
    await expect(page.getByRole('heading', { name: t(['chapterTest', 'preTitle'], locale) })).toBeVisible()
    await fillInstrument(page, 'chapter', chapterCount, chapterPreAnswers, 'radio')
    await submitChapterTest(page, 'pre')
    const preReceipt = page.locator('.ppg-instr-receipt')
    await expect(preReceipt).toBeVisible()
    await expect(preReceipt).toContainText(
      tFormat(['chapterTest', 'scoreLine'], locale, { score: 10, total: 10 }),
    )
    await expect(preReceipt).toContainText(`${t(['chapterTest', 'attempts'], locale)}: 1`)
    // The pre-test is one attempt: the form is gone.
    await expect(page.locator('form[data-ppg-chapter-test="pre"]')).toHaveCount(0)

    // 8. The three CAI lessons, each with its mini-check. Lesson 1 answers
    // WRONG then RIGHT: the wrong feedback never gates (Next stays enabled and
    // moves on), and the correct answer is acked by the server-side grade.
    const lessonKeys = ['chapter-01-lesson-01', 'chapter-01-lesson-02', 'chapter-01-lesson-03']
    for (const [index, lessonKey] of lessonKeys.entries()) {
      const checkKeys = lessonCheckAnswerKey(lessonKey)
      await page.goto(`/${locale}/course/chapter-01/${lessonKey}`)
      await expect(page.locator('[data-ppg-lesson]')).toBeVisible()
      let stepIndex = 0
      for (let guard = 0; guard < 12; guard++) {
        const kind = await page.locator('[data-ppg-step-kind]').getAttribute('data-ppg-step-kind')
        if (kind === 'check') {
          stepIndex = Number(await page.locator('[data-ppg-lesson]').getAttribute('data-ppg-step-index'))
          break
        }
        await page.locator('[data-ppg-nav="next"]').click()
      }
      const correct = checkKeys[String(stepIndex)]
      expect(correct, `${lessonKey} step ${stepIndex} has a mini-check key`).toBeTruthy()
      if (index === 0) {
        await page.locator(`#mini_${stepIndex}_${wrongOption(correct!)}`).check()
        await page.locator('[data-ppg-cta="mini-check"]').click()
        await expect(page.locator('[data-ppg-mini-result="incorrect"]')).toBeVisible()
        // No gating: a wrong mini-check still lets the player continue.
        const next = page.locator('[data-ppg-nav="next"]')
        await expect(next).toBeEnabled()
        await next.click()
        await expect(page.locator('[data-ppg-step-kind]')).toHaveAttribute('data-ppg-step-kind', 'summary')
        await page.locator('[data-ppg-nav="back"]').click()
      }
      await page.locator(`#mini_${stepIndex}_${correct}`).check()
      await page.locator('[data-ppg-cta="mini-check"]').click()
      await expect(page.locator('[data-ppg-mini-result="correct"]')).toBeVisible()
    }

    // 9. The Knowledge Mission: six questions, the correct key passes at 70%
    // and awards +100 XP exactly once (no legacy module badge for a chapter).
    const missionKey = missionAnswerKey('chapter-01')
    const missionCount = Object.keys(missionKey).length
    expect(missionCount).toBeGreaterThanOrEqual(5)
    await page.goto(`/${locale}/course/chapter-01/mission`)
    await expect(page.locator('body')).toContainText(t(['mission', 'instructionsHeading'], locale))
    await expect(page.locator('[data-ppg-mission-panel="challenge"]')).toBeVisible()
    for (let n = 1; n <= missionCount; n++)
      await page.locator(`#answer_${n}_${missionKey[String(n)]}`).check()
    const mission = await submitForm(page, '[data-ppg-mission-form=mission]', '/api/mission/submit', true)
    expect(mission.outcome).toBe('pass')
    expect(mission.xpGranted).toBe(100)
    await page.goto(`/${locale}`)
    await expectXpLine(page, 100, 100)
    // Mission complete → the post-test is the next action.
    await expect(primaryCta(page)).toHaveAttribute(
      'href',
      RegExp(`/${locale}/course/chapter-01/chapter-test/post$`),
    )

    // 10. GATE, FAIL DIRECTION: all-wrong post-test scores 0/10, stays below
    // 70%, and chapter-02 stays LOCKED. The receipt keeps the first score and
    // the form stays (retries are allowed).
    await page.goto(`/${locale}/course/chapter-01/chapter-test/post`)
    await fillInstrument(page, 'chapter', chapterCount, chapterPostWrong, 'radio')
    await submitChapterTest(page, 'post')
    const failReceipt = page.locator('.ppg-instr-receipt')
    await expect(failReceipt).toBeVisible()
    await expect(failReceipt).toContainText(
      tFormat(['chapterTest', 'scoreLine'], locale, { score: 0, total: 10 }),
    )
    await expect(failReceipt).toContainText(`${t(['chapterTest', 'attempts'], locale)}: 1`)
    await expect(failReceipt).toContainText(t(['chapterTest', 'notPassed'], locale))
    await expect(page.locator('form[data-ppg-chapter-test="post"]')).toBeVisible()

    await page.goto(`/${locale}/course`)
    await expect(stageOf(page, 'chapter-01')).toHaveAttribute('data-ppg-stage-state', 'open')
    await expect(stageOf(page, 'chapter-02')).toHaveAttribute('data-ppg-stage-state', 'locked')
    await expect(page.locator('[data-ppg-stage-module][data-ppg-stage-state="locked"]')).toHaveCount(8)
    await expect(page.locator('[data-ppg-stage-module][data-ppg-stage-state="cleared"]')).toHaveCount(0)
    // The dashboard still points at chapter-01's post-test.
    await page.goto(`/${locale}`)
    await expect(primaryCta(page)).toHaveAttribute(
      'href',
      RegExp(`/${locale}/course/chapter-01/chapter-test/post$`),
    )

    // 11. GATE, PASS DIRECTION: the retry answers the whole key. The receipt
    // names the preserved first score and the 10/10 best; chapter-02 unlocks,
    // chapter-01 clears, and the fixed +200 XP + both chapter badges land.
    await page.goto(`/${locale}/course/chapter-01/chapter-test/post`)
    await fillInstrument(page, 'chapter', chapterCount, chapterPostAnswers, 'radio')
    await submitChapterTest(page, 'post')
    const passReceipt = page.locator('.ppg-instr-receipt')
    await expect(passReceipt).toContainText(
      tFormat(['chapterTest', 'scoreLine'], locale, { score: 10, total: 10 }),
    )
    await expect(passReceipt).toContainText(`${t(['chapterTest', 'attempts'], locale)}: 2`)
    await expect(passReceipt).toContainText(`${t(['chapterTest', 'firstScore'], locale)}: 0 / 10`)
    await expect(passReceipt).toContainText(`${t(['chapterTest', 'bestScore'], locale)}: 10 / 10`)
    await expect(passReceipt).toContainText(t(['chapterTest', 'passed'], locale))
    // The unlock line is a page-level state line (outside the receipt card).
    await expect(page.locator('body')).toContainText(
      `${t(['chapterTest', 'nextUnlocked'], locale)} (chapter-02)`,
    )

    await page.goto(`/${locale}/course`)
    await expect(stageOf(page, 'chapter-01')).toHaveAttribute('data-ppg-stage-state', 'cleared')
    await expect(stageOf(page, 'chapter-02')).toHaveAttribute('data-ppg-stage-state', 'open')
    await expect(page.locator('[data-ppg-stage-module][data-ppg-stage-state="locked"]')).toHaveCount(7)
    await expect(page.locator('[data-ppg-stage-module][data-ppg-stage-state="cleared"]')).toHaveCount(1)
    await expect(page.locator('[data-ppg-stage-direction="next"] a')).toHaveAttribute(
      'href',
      RegExp(`/${locale}/course/chapter-02$`),
    )
    await page.goto(`/${locale}`)
    await expectXpLine(page, 300, 100)
    await expectBadge(page, locale, 'first_chapter_cleared')
    await expectBadge(page, locale, 'perfect_chapter_posttest')
    // The loop moved on: chapter-02's pre-test is the next action.
    await expect(primaryCta(page)).toHaveAttribute(
      'href',
      RegExp(`/${locale}/course/chapter-02/chapter-test/pre$`),
    )

    // 12. TEST FIXTURE (comment above `seedChapterUnlocksFixture`): the loop
    // is proven; seed the nine-unlock record the Final Test gate reads
    // (#86: chapter-02..chapter-10 = nine distinct chapter rows).
    seedChapterUnlocksFixture(uuid, [
      'chapter-02', 'chapter-03', 'chapter-04', 'chapter-05', 'chapter-06',
      'chapter-07', 'chapter-08', 'chapter-09', 'chapter-10',
    ])
    await page.goto(`/${locale}/course`)
    await expect(page.locator('[data-ppg-stage-module][data-ppg-stage-state="cleared"]')).toHaveCount(1)
    await expect(page.locator('[data-ppg-stage-module][data-ppg-stage-state="open"]')).toHaveCount(8)
    await expect(page.locator('[data-ppg-stage-module][data-ppg-stage-state="locked"]')).toHaveCount(0)

    // 13. The 50-item Final Test: all correct → 50/50, +400 XP and the
    // final_test_complete badge exactly once.
    await page.goto(`/${locale}/post-test`)
    await expect(page.locator('body')).toContainText(t(['posttest', 'states', 'unlocked'], locale))
    await expect(page.locator('input[name="item_1"]').first()).toBeVisible()
    await expect(page.locator('input[name="item_50"]').first()).toBeVisible()
    const finalKey = posttestAnswerKey()
    expect(Object.keys(finalKey).length).toBe(50)
    await fillInstrument(page, 'posttest', 50, finalKey, 'instrument-radio')
    const finalAttempt = await submitForm(page, '[data-ppg-posttest-form=posttest]', '/api/posttest/submit', true)
    expect(finalAttempt.score).toBe(50)
    await page.goto(`/${locale}`)
    await expectXpLine(page, 700, 100)
    await expectBadge(page, locale, 'final_test_complete')

    // 14. A WRONG retry appends an attempt and does NOT overwrite the research
    // measure: the first score stays 50, the best stays 50, and the reward is
    // not granted twice (XP stays 700, one badge row).
    await page.goto(`/${locale}/post-test`)
    await fillInstrument(page, 'posttest', 50, wrongAnswersFromKey(finalKey), 'instrument-radio')
    const retryAttempt = await submitForm(page, '[data-ppg-posttest-form=posttest]', '/api/posttest/submit', true)
    expect(retryAttempt.score).toBe(0)
    await page.goto(`/${locale}/post-test`)
    const finalReceipt = page.locator('.ppg-instr-receipt')
    await expect(finalReceipt).toContainText(`${t(['posttest', 'firstScoreLabel'], locale)}: 50`)
    await expect(finalReceipt).toContainText(`${t(['posttest', 'bestScoreLabel'], locale)}: 50`)
    await expect(finalReceipt).toContainText(`${t(['posttest', 'attemptsLabel'], locale)}: 2`)
    await page.goto(`/${locale}`)
    await expectXpLine(page, 700, 100)
    await expectBadge(page, locale, 'final_test_complete')
    await page.goto(`/${locale}/course`)
    const finalTestCard = page.locator('[data-ppg-final-test-state="present"]')
    await expect(finalTestCard).toContainText(t(['course', 'finalTest', 'completed'], locale))

    // 15. The leaderboard is XP-only: the caller's real row shows their own
    // 700 XP and no rubric/score material ever reaches it.
    await page.goto(`/${locale}/leaderboard`)
    const ownRow = page.locator('.ppg-pod', { hasText: learnerName })
    await expect(ownRow).toHaveCount(1)
    await expect(ownRow).toContainText(`700 ${t(['leaderboard', 'xp'], locale)}`)
    await expect(page.locator('body')).not.toContainText(t(['review', 'rubricHeading'], locale))

    // 16. The Satisfaction Survey follows the Final Test, then the loop is
    // DONE: no primary CTA remains.
    await page.goto(`/${locale}/survey`)
    await expect(page.locator('body')).toContainText(t(['survey', 'states', 'unlocked'], locale))
    // The survey now renders one required radiogroup per item (the same
    // control system as the Pre-Test and Final Test); the seeded survey
    // version still has two items.
    await fillInstrument(page, 'survey', 2, { item_1: 'B', item_2: 'C' })
    await submitForm(page, '[data-ppg-survey-form=survey]', '/api/survey/submit', true)
    await page.goto(`/${locale}/survey`)
    await expect(page.locator('.ppg-instr-receipt')).toBeVisible()
    await page.goto(`/${locale}`)
    // The survey has landed, so no survey CTA remains. (The seeded chapters
    // 2-9 were never passed, so the loop legitimately still points at
    // chapter-02's pre-test — the fixture is an unlock record only.)
    await expect(page.locator('[data-ppg-cta="primary"][href$="/survey"]')).toHaveCount(0)
    await expect(primaryCta(page)).toHaveAttribute(
      'href',
      RegExp(`/${locale}/course/chapter-02/chapter-test/pre$`),
    )
    await rawLeakCheck(page)

    // 17. NO practical/upload/review entry point anywhere, and the archived
    // legacy module/lesson URLs render unavailable to the learner.
    await page.goto(`/${locale}/course`)
    await expect(page.locator('a[href*="practical"], a[href*="upload"], a[href*="review"]')).toHaveCount(0)
    await page.goto(`/${locale}`)
    await expect(page.locator('a[href*="practical"], a[href*="upload"], a[href*="review"]')).toHaveCount(0)
    await page.goto(`/${locale}/course/module-01`)
    await expect(page.locator('body')).toContainText(t(['lesson', 'states', 'empty'], locale))
    await expect(page.locator('a[href*="module-01-lesson"]')).toHaveCount(0)
    await page.goto(`/${locale}/course/module-01/module-01-lesson-01`)
    await expect(page.locator('body')).toContainText(t(['lesson', 'states', 'empty'], locale))
    await page.goto(`/${locale}/course/module-08/practical`)
    await expect(page.locator('[data-ppg-unavailable="true"]')).toBeVisible()
    await expect(page.locator('body')).toContainText(t(['practical', 'unavailableTitle'], locale))
    await expect(page.locator('input[type="file"]')).toHaveCount(0)
    await page.goto(`/${locale}/course/module-08/review`)
    await expect(page.locator('[data-ppg-unavailable="true"]')).toBeVisible()
    await expect(page.locator('body')).toContainText(t(['review', 'unavailableTitle'], locale))
    await rawLeakCheck(page)
  })
})
