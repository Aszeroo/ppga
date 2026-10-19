import { test, expect, type Page } from '@playwright/test'

import { accounts, LEARNER_UUID, deckFixture, signIn, signOut, submitForm, t, expectBadge, expectXpLine, expectXpChip, lockStateCopy, clearedStateCopy, RAW_KEY_LEAK, expectShellNav, expectStandaloneScreen } from './helpers'

/**
 * PPGA #18 (the verification ticket): the critical journey, end to end,
 * through the REAL browser + the REAL DATABASE. The journey runs TWICE per
 * `playwright test` run — once per project: `th` drives Learner One
 * (`64110001`), `en` drives Learner Two (`64110002`) — the ticket's "green
 * in CI in both languages" holds with ONE shard (CI time stays sane: the
 * journey is the suite, not per-pixel snapshots; the `globalSetup`'s
 * `supabase db reset` gives every run the known baseline, hermetic across
 * re-runs).
 *
 * Assertions ride the OBSERVABLE state only — the login's own `redirect`
 * field, the header's ledger-read numerals, the course map's lock/unlock
 * copy, the teacher queue's rows, the learner result's verdict, the
 * dashboard's close-chain links. No implementation detail, no mocked
 * outcome: every transition runs the native form's POST against the API
 * route; the route posts the RPC; the RPC's RLS + gates at the CALLER's own
 * JWT decide — the JSON the screen ends on is the decision's own print
 * (the platform's shipped pattern; the finding is REPORTED here, never
 * rewritten).
 */
test.describe('PPGA #18 critical journey', () => {
  test.setTimeout(420000)

  test('login → consent → Pre-Test gate → Lesson → Self-Check → Mission → XP/Level → Unlock → Teacher review → learner result → Final Project → Post-Test → Survey', async (
    { page }, testInfo) => {
    const locale = testInfo.project.use.locale as string
    const learner = accounts.learners[locale]
    const uuid = LEARNER_UUID[locale]
    const rawLeakCheck = async (target: Page) => {
      const text = await target.locator('body').textContent()
      expect(RAW_KEY_LEAK.exec(text ?? '')).toBeFalsy()
    }
    // The count reads the RENDERED text only: `innerText` excludes the
    // <script> payloads (the i18n messages bootstrap + the RSC flight data
    // carry every message string verbatim — textContent counted the open
    // copy 3× on a 1-open map). The wait rides the #44 stage node's own
    // `data-ppg-stage-state` — the count never races the map's Suspense
    // fallback (stages: cleared | open | locked, the copy per state node).
    const lockCopyCount = async (open: boolean, target: Page) => {
      await expect(target.locator('[data-ppg-stage-state]').first()).toBeVisible()
      return ((await target.locator('body').innerText())?.match(RegExp(lockStateCopy(locale, open), 'g'))?.length ?? 0)
    }
    const clearedCopyCount = async (target: Page) => {
      await expect(target.locator('[data-ppg-stage-state]').first()).toBeVisible()
      return ((await target.locator('body').innerText())?.match(RegExp(clearedStateCopy(locale), 'g'))?.length ?? 0)
    }
    const criteria = ['content_structure', 'text_formatting', 'images_visual', 'slide_design', 'powerpoint_tool_usage', 'creativity', 'completeness']

    // PPGA #43 (ticket #43): the Dashboard hub's observable pins — the ONE
    // primary CTA (the `data-ppg-cta` marker renders exactly once) and the
    // player-status summary region (real rows only; a missing datum renders
    // no row). The AC chain: fresh → explanation, mid-course → the Course,
    // the Final Project `submitted` → the review status, Post-Test eligible →
    // the Post-Test, Survey eligible → the Survey, done → NO CTA.
    const primaryCta = (target: Page) => target.locator('[data-ppg-cta="primary"]')
    const hubStatus = (target: Page) => target.locator('[data-ppg-hub="status"]')

    // 0. The anonymous caller reaches the login page — the unauthorized
    // state is the login page, never a blank screen (/health is the public
    // deployment probe; /profile is the guard's protected pathname). The
    // login is the STANDALONE 8-bit title/start screen OUTSIDE the Shell
    // frame (the issue: the login/logout render standalone): the Shell's
    // title copy is present and the learner's nav destinations never.
    await page.goto(`/${locale}/profile`)
    await expect(page).toHaveURL(RegExp(`/${locale}/login$`))
    await expect(page.locator('body')).toContainText(t(['login', 'submit'], locale))
    await rawLeakCheck(page)
    await expectStandaloneScreen(page, locale)

    // 1. Sign in WITHOUT consent → the dashboard's respectful explanation;
    // the gate guard denies the Pre-Test pathname (the UI's state; the
    // DATABASE's RLS denies the items read at the row level, independently).
    await signIn(page, locale, learner, '/')
    await expect(page.locator('body')).toContainText(t(['home', 'states', 'noConsent'], locale))
    // The fresh state's ONE primary CTA is the respectful consent explanation.
    await expect(primaryCta(page)).toHaveCount(1)
    await expect(primaryCta(page)).toHaveText(t(['home', 'nextActionExplanation'], locale))
    // The learner's Dashboard rides the persistent Shell frame — the
    // learner's nav (Dashboard, Course, Badges, Leaderboard, Profile)
    // appears exactly (the issue's story #3/#11: destinations a Learner
    // reaches, nothing another-role's destination).
    await expectShellNav(page, locale, 'learner')
    await page.goto(`/${locale}/pre-test`)
    await expect(page).toHaveURL(RegExp(`/${locale}$`))

    // 2. The Admin records the paper consent OFFLINE (the admin console —
    // #18 unblocked this pathname for staff; one RPC call = one profile
    // UPDATE + exactly one audit INSERT, same transaction; the admin's own
    // JWT is the gate's authority). A separate browser context: the admin's
    // session cookies never touch the learner's jar.
    const adminCtx = await page.context().browser()!.newContext()
    const admin = await adminCtx.newPage()
    await signIn(admin, locale, accounts.admin, '/profile')
    await admin.goto(`/${locale}/admin/users`)
    // The Admin's console rides the same Shell frame — the admin's nav
    // (Dashboard, Course / Publication, User list, Audit stream, Provision
    // roster, Export, Health, Profile) appears exactly; the learner's
    // Course/Badges/Leaderboard destinations never render for this role.
    await expectShellNav(admin, locale, 'admin')
    await admin.locator('#admin_consent_target_id').fill(uuid)
    await admin.locator('#admin_consent_flag').selectOption('true')
    await submitForm(admin, '[data-ppg-admin-form=consent]', '/api/admin/consent', true)
    await adminCtx.close()

    // 3. The learner logs out + logs in AGAIN (the persistence across the
    // logout — the login route RE-reads the DATABASE's flags and RE-set
    // the httpOnly gate cookies). Now consenting, un-submitted → the gate's
    // redirect lands ONLY on the Pre-Test pathname.
    await signOut(page, locale)
    await signIn(page, locale, learner, '/pre-test')
    // The items section's ACCESSIBLE NAME (its `aria-label` — an observable
    // ARIA state, PRD: "ARIA labels … verified"; body text never carries it,
    // and the Thai glossary's placeholder-collapsed strings made a body-text
    // check pass in `th` for the wrong reason while it failed in `en`). In
    // `th` the gate section shares the collapsed name, so the region is
    // pinned by its loaded item prompts (the seed renders both prompt
    // languages verbatim, locale-independent — the items really loaded).
    await expect(
      page.getByRole('region', { name: t(['pretest', 'itemsLabel'], locale) })
        .filter({ hasText: 'Thai city' }),
    ).toBeVisible()

    // 4. The Pre-Test: the answer (the seed's own `answer` key `A` rides
    // the screen's letter pattern); the submit scores SERVER-side from the
    // answer key the browser never sees; `submitted_at` stamps atomically.
    await page.locator('#prettest_answer_item_1').fill('A')
    const pretest = await submitForm(page, '[data-ppg-pretest-form=prettest]', '/api/prettest/submit', true)
    // The RPC's return is the raw correct-COUNT (the seam's own contract:
    // `ppg_prettest_submit('{"item_1":"A"}'::jsonb)` → 1 — the 1-item
    // instrument's full credit), never a percentage.
    expect(pretest.score).toBe(1)

    // The `ppga_pretest_submitted` cookie rides the LOGIN read, not the
    // submit response (the shipped pattern — the journey does the real
    // logout/re-login a production learner would; the finding is REPORTED).
    // The gate now OPEN → the login's redirect lands `/profile`.
    await signOut(page, locale)
    await signIn(page, locale, learner, '/profile')

    // 5. The Course map BEFORE the work, as the #44 STAGE MAP: Module 1 OPEN
    // (the gate alone) + the next-stage direction pointing at it, Module
    // 2..11 LOCKED (the linear rule's `incomplete` + the un-passed LAST-
    // lesson check). The lock copy never a colour-only cue: every locked
    // stage node carries the copy + `data-ppg-stage-state="locked"` +
    // `aria-disabled` + the stripes, visible, never hidden, never linked.
    await page.goto(`/${locale}/course`)
    expect(await lockCopyCount(true, page)).toBe(1)
    expect(await lockCopyCount(false, page)).toBe(10)
    expect(await clearedCopyCount(page)).toBe(0)
    expect(await page.locator('[data-ppg-stage-state="locked"][aria-disabled="true"]').count()).toBe(10)
    await expect(page.locator('[data-ppg-stage-direction="next"] a')).toHaveAttribute('href', new RegExp(`/${locale}/course/module-01$`))
    await rawLeakCheck(page)

    // 6. Lesson 1 (Opening PowerPoint): the WHAT/WHY/BODY/WITH-NEXT
    // structure from the DATABASE's own bilingual columns. Self-Check
    // ends the Lesson; the key NEVER reaches the browser (the policy
    // denies a client SELECT; the check RPC's sum decides SERVER-side);
    // every correct option is the seed's `a` (the journey clicks the
    // option the learner SAW, never a hidden key). +50 + the First Steps
    // badge, the ledger/award PK's exactly-once grants.
    await page.goto(`/${locale}/course/module-01/module-01-lesson-01`)
    await expect(page.locator('body')).toContainText(t(['lesson', 'whatHeading'], locale))
    // The #45 challenge framing BEFORE the pass: the Lesson → Self-Check →
    // Mission track renders its states from the reads (check pending → the
    // Mission step still LOCKED, stripes + `aria-disabled`, never a link)
    // and ZERO reward chips — nothing claims a grant that has not landed.
    await expect(page.locator('[data-ppg-challenge-track]')).toBeVisible()
    await expect(page.locator('[data-ppg-challenge-step="mission"][data-ppg-stage-state="locked"]')).toHaveCount(1)
    await expect(page.locator('[data-ppg-xp-event]')).toHaveCount(0)
    await page.locator('#answer_1_a').click()
    await page.locator('#answer_2_a').click()
    const selfCheck1 = await submitForm(page, '[data-ppg-self-check-form=selfcheck]', '/api/self-check/submit', true)
    expect(selfCheck1.outcome).toBe('pass')
    expect(selfCheck1.xpGranted).toBe(50)
    expect(selfCheck1.badgeGranted).toBe(true)
    // The #45 framing AFTER the pass: the shipped rule note swapped for the
    // REAL ledger row (the lesson's own `self_check_pass` PK, its own +50 —
    // exactly once, and no success pill coexists with the rendered grant).
    await page.goto(`/${locale}/course/module-01/module-01-lesson-01`)
    await expectXpChip(page, 'self_check_pass:module-01-lesson-01', 50)
    await expect(page.locator('.ppg-status-pill[data-ppg-tone="success"]')).toHaveCount(0)

    // XP/Level VISIBLE: the header's read of the learner's OWN ledger
    // (total = the SUM; level = floor(total/100)+1; never a client count).
    await page.goto(`/${locale}`)
    await expectXpLine(page, 50, 50)
    await expectBadge(page, locale, 'first_steps')
    // The hub summary (ticket #43): course progress = the learner's OWN
    // complete Mission rows (0 yet — module-01's Mission is not passed), and
    // the CURRENT Mission is module-01's, linked to the real screen. The
    // gate-open mid-course CTA is the Course map.
    await expect(hubStatus(page)).toContainText(`${t(['home', 'courseProgress'], locale)} 0 / 11`)
    await expect(hubStatus(page)).toContainText(t(['home', 'missionCurrent'], locale))
    await expect(page.locator('[data-ppg-hub="status"] a[href*="module-01/mission"]')).toBeVisible()
    await expect(primaryCta(page)).toHaveText(t(['home', 'linkCourse'], locale))

    // 7. Lesson 2 (panes & views) — the SECOND +50 rides the ledger PK's
    // own per-lesson `event_ref`; the header re-reads the SUM live.
    await page.goto(`/${locale}/course/module-01/module-01-lesson-02`)
    await page.locator('#answer_1_a').click()
    await page.locator('#answer_2_a').click()
    await submitForm(page, '[data-ppg-self-check-form=selfcheck]', '/api/self-check/submit', true)
    await page.goto(`/${locale}`)
    await expectXpLine(page, 100, 100)

    // 8. The Mission the Lessons END into (Knowledge, Module 1): visible
    // ONLY with the LAST Lesson's check passed + the gate open. The 70%
    // threshold the SERVER applies; the three `a` answers score 100.
    // +100 + the `module_01_mission` badge; the completion unlocks Module 2.
    await page.goto(`/${locale}/course/module-01/mission`)
    await expect(page.locator('body')).toContainText(t(['mission', 'instructionsHeading'], locale))
    // The #45 framing BEFORE the pass: the attempt panel is the CHALLENGE
    // state (the SERVER's availability read says attemptable) with ZERO
    // reward chips — the +100 the shipped note promises is NOT yet shown.
    await expect(page.locator('[data-ppg-mission-panel="challenge"]')).toBeVisible()
    await expect(page.locator('[data-ppg-xp-event]')).toHaveCount(0)
    await page.locator('#answer_1_a').click()
    await page.locator('#answer_2_a').click()
    await page.locator('#answer_3_a').click()
    const mission1 = await submitForm(page, '[data-ppg-mission-form=mission]', '/api/mission/submit', true)
    expect(mission1.outcome).toBe('pass')
    expect(mission1.xpGranted).toBe(100)
    // The #45 framing AFTER the pass: the panel CLEARED by the learner's
    // OWN `complete` Mission row, the chip the REAL +100 ledger row (its
    // PK — never a schedule claim), and the unlock band pointing at Module 2
    // because the course-map read ALREADY speaks it open (never invented).
    await page.goto(`/${locale}/course/module-01/mission`)
    await expect(page.locator('[data-ppg-mission-panel="clear"]')).toBeVisible()
    await expectXpChip(page, 'knowledge_mission_pass:module-01', 100)
    await expect(page.locator('[data-ppg-unlock="next-module"] a')).toHaveAttribute('href', new RegExp(`/${locale}/course/module-02$`))
    await expect(page.locator('.ppg-status-pill[data-ppg-tone="success"]')).toHaveCount(0)
    await page.goto(`/${locale}`)
    await expectXpLine(page, 200, 100)
    await expectBadge(page, locale, 'module_01_mission')
    // Course progress moved to the learner's ONE real completion.
    await expect(hubStatus(page)).toContainText(`${t(['home', 'courseProgress'], locale)} 1 / 11`)

    // UNLOCK OBSERVED (the transition, never a claimed flag): the stage map
    // re-read — Module 1 now CLEARED (its own `complete` Mission row),
    // Module 2 OPEN and the direction pointing at it; Module 3..11 still
    // LOCKED.
    await page.goto(`/${locale}/course`)
    await rawLeakCheck(page)
    expect(await lockCopyCount(true, page)).toBe(1)
    expect(await lockCopyCount(false, page)).toBe(9)
    expect(await clearedCopyCount(page)).toBe(1)
    await expect(page.locator('[data-ppg-stage-direction="next"] a')).toHaveAttribute('href', new RegExp(`/${locale}/course/module-02$`))

    // 9. The loop AGAIN for Module 2 — the Self-Check questions of
    // Module 2's Lesson #18's completion seed made the linear rule
    // traversable for real (the story: pass the check, then attempt the
    // Mission; before #18 the screen's empty state dead-ended here).
    await page.goto(`/${locale}/course/module-02/module-02-lesson-01`)
    await page.locator('#answer_1_a').click()
    await page.locator('#answer_2_a').click()
    await submitForm(page, '[data-ppg-self-check-form=selfcheck]', '/api/self-check/submit', true)
    await page.goto(`/${locale}`)
    await expectXpLine(page, 250, 50)
    await page.goto(`/${locale}/course/module-02/mission`)
    await page.locator('#answer_1_a').click()
    await submitForm(page, '[data-ppg-mission-form=mission]', '/api/mission/submit', true)
    await page.goto(`/${locale}`)
    await expectXpLine(page, 350, 50)
    await expectBadge(page, locale, 'module_02_mission')
    // Two real completions; the CURRENT Mission moved on to module-03.
    await expect(hubStatus(page)).toContainText(`${t(['home', 'courseProgress'], locale)} 2 / 11`)
    await expect(page.locator('[data-ppg-hub="status"] a[href*="module-03/mission"]')).toBeVisible()
    await page.goto(`/${locale}/course`)
    expect(await lockCopyCount(false, page)).toBe(8)
    expect(await lockCopyCount(true, page)).toBe(1)
    expect(await clearedCopyCount(page)).toBe(2)
    await expect(page.locator('[data-ppg-stage-direction="next"] a')).toHaveAttribute('href', new RegExp(`/${locale}/course/module-03$`))

    // 10. THE PRACTICAL (Module 8) + the Teacher-review sub-journey INSIDE
    // the critical journey. Upload: the REAL .pptx fixture (`PK\x03\x04`
    // magic prefix + ~196 KB real bytes — never a mocked upload); the
    // private bucket + the one append-only row (`in_progress`); the
    // learner's OWN `in_progress → submitted` move (#18's wire — without
    // which the upload NEVER reaches a Teacher's queue).
    await page.goto(`/${locale}/course/module-08/practical`)
    await page.setInputFiles('input[type=file]', deckFixture)
    await page.locator('input[name=reflection]').fill('Module 8 LMS deployment reflection — critical-journey verification round 1.')
    const upload1 = await submitForm(page, '[data-ppg-submission-form=submission]', '/api/submissions', true)
    expect(upload1.submissionSeq).toBe(1)
    await page.goto(`/${locale}/course/module-08/practical`)
    await expect(page.locator('body')).toContainText('in_progress')
    await submitForm(page, '[data-ppg-submission-status-form]', '/api/submissions/status', true)
    await page.goto(`/${locale}/course/module-08/practical`)
    await expect(page.locator('body')).toContainText('submitted')
    // The hub surfaces the Submission status (ticket #43 AC): the module-08
    // round rides `submitted` — awaiting the Teacher. Mid-course the CTA
    // stays the Course (the awaiting-review CTA is the FINAL round's own).
    await page.goto(`/${locale}`)
    await expect(hubStatus(page)).toContainText('module-08 #1')
    await expect(hubStatus(page)).toContainText('(submitted)')
    await expect(primaryCta(page)).toHaveText(t(['home', 'linkCourse'], locale))

    // Teacher SEAM: the queue reads `submitted` rows ONLY; the rubric 7×
    // (score 4 radios — the SERVER computes 28/35, never a client count) +
    // bilingual feedback + the `decision=approved` button. +150 XP + the
    // `module_08_mission` badge ride the approval event (the ledger/award
    // PKs, exactly-once). The Teacher holds a OWN-context session (its
    // JWT is the RPC's role gate's authority).
    const teacherCtx = await page.context().browser()!.newContext()
    const teacher = await teacherCtx.newPage()
    await signIn(teacher, locale, accounts.teacher, '/profile')
    await teacher.goto(`/${locale}/teacher/review`)
    // The Teacher's queue rides the same Shell frame — the teacher's nav
    // (Dashboard, Review Queue, Profile) appears exactly; the learner's
    // Course/Badges/Leaderboard destinations never render for this role.
    await expectShellNav(teacher, locale, 'teacher')
    await expect(teacher.locator('body')).toContainText(`${accounts.learners[locale]}`)
    // The queue row is pinned by BOTH the module and THIS learner's student
    // ID: the projects share one database across the invocation (one global
    // `db reset` serves both `th` and `en`), so after the `th` journey the
    // queue holds a second `module-08` section — `.first()` alone would let
    // the `en` teacher re-review the `th` learner's already-reviewed row
    // (the RPC answers `error`, and CI runs both projects in one go).
    await teacher.locator('section').filter({ hasText: 'module-08' }).filter({ hasText: accounts.learners[locale] }).locator('a[href*="/teacher/review/"]').first().click()
    for (const key of criteria)
      await teacher.locator(`input[type=radio][name=score_${key}]`).nth(3).click()
    await teacher.locator('#review_feedback_th').fill('โครงสร้างสไลด + text + image + SmartArt + transition ครบทกทักษะ — สไลด teaching; deliverable ครบ. (rubric 4 each) #18 journey round.')
    await teacher.locator('#review_feedback_en').fill('Structure complete: slides teach, deliverable present; fonts/colors/graphics/transition exercised. (rubric 4 each) #18 journey round.')
    const reviewResponse = teacher.waitForResponse((r) => r.url().includes('/api/review/submit'))
    await teacher.locator('button[name=decision][value=approved]').click()
    const reviewLanded = await reviewResponse
    await teacher.waitForLoadState()
    let reviewBody: Record<string, unknown>
    try {
      reviewBody = await reviewLanded.json()
    } catch {
      reviewBody = JSON.parse(await teacher.locator('body').innerText()) as Record<string, unknown>
    }
    // #18 verification finding #8: the review route speaks #14's shipped
    // `SubmitReviewState` (`{status:'ok', …}` — the shape `lib/sup/reviews.ts`
    // exports and the seam reads), NOT the sibling routes' `ok` flag. The
    // assertion rides that real contract — and reads the SERVER-computed
    // total + the granted XP straight off the print (never a client count).
    expect(reviewBody.status).toBe('ok')
    expect(reviewBody.decision).toBe('approved')
    expect(reviewBody.total_score).toBe(28)
    expect(reviewBody.xp_granted).toBe(150)

    // The learner's ledger grows by the approval (+150 → 500; Level 6).
    await page.goto(`/${locale}`)
    await expectXpLine(page, 500, 100)
    await expectBadge(page, locale, 'module_08_mission')

    // The #45 framing on the PRACTICAL after the approval: the panel CLEARED
    // by the learner's OWN completion, the chip the REAL +150 approval row
    // (the seam note never coexists with a rendered grant). And NO unlock
    // band: the DEPLOYED rule (#9 as rewritten by #10) opens Module N+1 only
    // on Module N's Mission complete AND its LAST Lesson's Self-Check passed
    // — this journey uploads Module 8's practical straight (no Lesson-08
    // checks), so Module 9 stays LOCKED and the band rides the MAP's `locked`
    // by rendering nothing (never invented).
    await page.goto(`/${locale}/course/module-08/practical`)
    await expect(page.locator('[data-ppg-mission-panel="clear"]')).toBeVisible()
    await expectXpChip(page, 'practical_approval:module-08', 150)
    await expect(page.locator('[data-ppg-unlock="next-module"]')).toHaveCount(0)
    await expect(page.locator('.ppg-status-pill[data-ppg-tone="success"]')).toHaveCount(0)

    // THE LEARNER SEES THE RESULT: the latest verdict + the SERVER total
    // 28/35 + the bilingual feedback + the append-only per-round history.
    await page.goto(`/${locale}/course/module-08/review`)
    await expect(page.locator('body')).toContainText(t(['review', 'approve'], locale))
    await expect(page.locator('body')).toContainText('28 / 35')
    // The Result step's surface shows the SAME real grant (one ledger row,
    // one chip — the verdict and the XP are the one approval event).
    await expectXpChip(page, 'practical_approval:module-08', 150)
    await rawLeakCheck(page)

    // The close chain stays LOCKED (the Post-Test unlocks on the Final
    // Project's acceptance, never earlier).
    await page.goto(`/${locale}`)
    await expect(page.locator('body')).toContainText(t(['home', 'states', 'closeLocked'], locale))
    // The hub: the latest round moved to `approved` and the Teacher's REAL
    // bilingual notes (this journey filled them) render as relevant feedback.
    await expect(hubStatus(page)).toContainText('(approved)')
    await expect(hubStatus(page)).toContainText('rubric 4 each')

    // 11. THE FINAL PROJECT (Module 11, practical): upload round 1 + the
    // `in_progress → submitted` move + the Teacher's rubric 5× (the
    // SERVER total 35/35) + the `approved` decision: +300 XP ONCE (the
    // ledger PK), the Final Boss + Course Complete badges ONCE (the award
    // PK), Level 5 iff the real total reaches 400 (800 — yes), the
    // completion writes the Post-Test's unlock authority.
    await page.goto(`/${locale}/course/module-11/practical`)
    await page.setInputFiles('input[type=file]', deckFixture)
    await page.locator('input[name=reflection]').fill('My PowerPoint Skills — the 8-slide Final Project, critical-journey verification round 1.')
    const finalUpload = await submitForm(page, '[data-ppg-submission-form=submission]', '/api/submissions', true)
    expect(finalUpload.submissionSeq).toBe(1)
    // The upload's native POST left the browser on the JSON print — the
    // status form only lives on the practical screen: ride back to it first
    // (the module-08 flow above, the same shipped wire).
    await page.goto(`/${locale}/course/module-11/practical`)
    await expect(page.locator('body')).toContainText('in_progress')
    await submitForm(page, '[data-ppg-submission-status-form]', '/api/submissions/status', true)
    // THE AWAITING-REVIEW STATE (the AC): the FINAL Project's own round is
    // now with the Teacher — the ONE primary CTA checks that review status.
    await page.goto(`/${locale}`)
    await expect(primaryCta(page)).toHaveCount(1)
    await expect(primaryCta(page)).toHaveText(t(['home', 'linkReviewStatus'], locale))
    await expect(primaryCta(page)).toHaveAttribute('href', new RegExp(`/${locale}/course/module-11/review$`))
    await expect(hubStatus(page)).toContainText('module-11 #1')
    await expect(hubStatus(page)).toContainText('(submitted)')
    await teacher.goto(`/${locale}/teacher/review`)
    await teacher.locator('section').filter({ hasText: 'module-11' }).filter({ hasText: accounts.learners[locale] }).locator('a[href*="/teacher/review/"]').first().click()
    for (const key of criteria)
      await teacher.locator(`input[type=radio][name=score_${key}]`).nth(4).click()
    await teacher.locator('#review_feedback_th').fill('พรeezenตครบ 8สไลดทกทกษ — Final Boss round. (rubric 5 each) #18 journey.')
    await teacher.locator('#review_feedback_en').fill('Eight slides, every Course skill exercised, checked before submitting. (rubric 5 each) #18 journey.')
    const approveFinal = teacher.waitForResponse((r) => r.url().includes('/api/review/submit'))
    await teacher.locator('button[name=decision][value=approved]').click()
    const finalLanded = await approveFinal
    await teacher.waitForLoadState()
    let finalBody: Record<string, unknown>
    try {
      finalBody = await finalLanded.json()
    } catch {
      finalBody = JSON.parse(await teacher.locator('body').innerText()) as Record<string, unknown>
    }
    // The same shipped `SubmitReviewState` contract as the module-08 round:
    // `status:'ok'` + the SERVER-computed 35/35 + the one-time +300.
    expect(finalBody.status).toBe('ok')
    expect(finalBody.decision).toBe('approved')
    expect(finalBody.total_score).toBe(35)
    expect(finalBody.xp_granted).toBe(300)

    // The learner's ledger: 800 XP, Level 9 = floor(800/100)+1; the badges
    // the approval writes: module_11_mission + final_boss +
    // course_complete + level_5 (the real total past 400 — never a flag).
    await page.goto(`/${locale}`)
    await expectXpLine(page, 800, 100)
    await expectBadge(page, locale, 'final_boss')
    await expectBadge(page, locale, 'course_complete')
    await expectBadge(page, locale, 'level_5')
    await expect(page.locator('body')).toContainText(`${t(['header', 'level'], locale)} 9`)

    // The #45 framing on the FINAL Project's Result: the chip the real +300
    // (`final_project` is the ledger's OWN type for this module — never a
    // schedule claim), and NO unlock band: Module 11 is the last stage, the
    // map read carries no next row, so nothing is invented.
    await page.goto(`/${locale}/course/module-11/review`)
    await expectXpChip(page, 'final_project:module-11', 300)
    await expect(page.locator('[data-ppg-unlock="next-module"]')).toHaveCount(0)
    await rawLeakCheck(page)

    // THE POST-TEST UNLOCKS (observable transition: the dashboard's link
    // appears iff the completion stands — before: the closeLocked copy;
    // now: the link's own copy).
    await page.goto(`/${locale}`)
    await rawLeakCheck(page)
    await expect(page.locator('body')).toContainText(t(['home', 'linkPostTest'], locale))
    // The CTA chain (AC): the Post-Test-eligible state's ONE CTA is the
    // Post-Test itself.
    await expect(primaryCta(page)).toHaveText(t(['home', 'linkPostTest'], locale))

    // 12. The Post-Test (single-attempt, the answer `A` the key; NO XP,
    // NO badge — a research instrument grants NOTHING, ADR-0001).
    await page.goto(`/${locale}/post-test`)
    await page.locator('#posttest_answer_item_1').fill('A')
    const posttest = await submitForm(page, '[data-ppg-posttest-form=posttest]', '/api/posttest/submit', true)
    // The raw correct-COUNT again (the 1-item instrument's full credit = 1;
    // the same server contract the pre-test's submit speaks).
    expect(posttest.score).toBe(1)

    // THE SURVEY UNLOCKS (iff the CALLER's Post-Test response is
    // submitted — the observable link transition again).
    await page.goto(`/${locale}`)
    await expect(page.locator('body')).toContainText(t(['home', 'linkSurvey'], locale))
    await expect(primaryCta(page)).toHaveText(t(['home', 'linkSurvey'], locale))
    await page.goto(`/${locale}/survey`)
    await page.locator('#survey_answer_item_1').fill('B')
    await page.locator('#survey_answer_item_2').fill('C')
    await submitForm(page, '[data-ppg-survey-form=survey]', '/api/survey/submit', true)
    await page.goto(`/${locale}`)
    await expect(page.locator('body')).toContainText(t(['home', 'states', 'closeDone'], locale))
    // Nothing left to do: the closeDone state renders NO primary CTA.
    await expect(primaryCta(page)).toHaveCount(0)
    await rawLeakCheck(page)

    // SINGLE-ATTEMPT OBSERVED: the second Pre-Test submit reaches
    // `already_submitted`, never a silent overwrite (the journey proves
    // the server's refusal, never the button's hidden state).
    await page.goto(`/${locale}/pre-test`)
    await page.locator('#prettest_answer_item_1').fill('B')
    const resubmit = await submitForm(page, '[data-ppg-pretest-form=prettest]', '/api/prettest/submit', false)
    expect(String(resubmit.detail ?? '')).toContain('already_submitted')

    // NO REWARDS BY DESIGN (ADR-0001): the close instruments grant
    // nothing — the header's ledger read stays 800/100 after the
    // Post-Test + the Survey both submitted.
    await page.goto(`/${locale}`)
    await expectXpLine(page, 800, 100)

    await teacherCtx.close()
  })
})
