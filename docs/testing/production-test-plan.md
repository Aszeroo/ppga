# Production test plan — performance & bilingual correctness

Date: 2026-11-17. Target: `https://ppga.vercel.app` (production), `main` at the deployed commit.
Test accounts: seeded learner `64110001` (course already complete), seeded learner `64110002` (fresh), seeded teacher/admin. Test data only.

## 1. Goals

1. Make the app feel responsive: fewer server round-trips, functions close to the database where the plan allows, no duplicate reads per request.
2. Make the bilingual behaviour predictable: one language per screen, no cross-language fallback, locale choice persists across navigation, refresh, logout and login.
3. Prove every feature still works in production, including small ones, with a written checklist and recorded results.

## 2. Baseline (measured 2026-11-17, before optimization)

| Page | TTFB | Total |
|---|---|---|
| `/api/health` | 2.36s | 2.37s |
| `/th/login` | 2.24s | 2.49s |
| `/en/login` | 0.50s | 0.73s |
| `/th` (dashboard) | 2.26s | 3.91s |
| `/en` | 2.06s | 3.67s |
| `/th/course` | 1.54s | 2.03s |
| `/th/course/chapter-01` | 1.51s | 1.76s |
| `/th/course/chapter-01/chapter-test/pre` | 1.59s | 1.85s |
| `/th/course/chapter-01/chapter-01-lesson-01` | 2.12s | 2.66s |

Observed cause candidates: Vercel function region `iad1` against Supabase `ap-southeast-1` (`x-vercel-id: sin1::iad1`), serial shell reads (profile then XP), duplicate XP read (HUD + dashboard), separate gate/items reads, three serial hub queries, cross-locale message merge on every request.

## 3. Performance budgets (warm production, 3 runs, median)

| Surface | Target TTFB | Target total |
|---|---|---|
| `/api/health` | ≤ 0.6s | ≤ 0.8s |
| Login (public) | ≤ 0.8s | ≤ 1.2s |
| Dashboard | ≤ 1.2s | ≤ 2.0s |
| Course / chapter overview | ≤ 1.0s | ≤ 1.8s |
| Chapter test / lesson | ≤ 1.2s | ≤ 2.2s |
| Final test / survey | ≤ 1.2s | ≤ 2.2s |

Record the median of three runs per page. A page fails if it exceeds the target twice.

## 4. Feature matrix

### 4.1 Public & build
- [ ] `/api/health` returns `{"status":"ok"...}`.
- [ ] Anonymous `/th` and `/en` 307 to `/<locale>/login`; login pages 200.
- [ ] Both login pages render the current locale only, no raw message keys.
- [ ] Static assets and fonts load (no 404/500).
- [ ] Unknown route returns the framework 404, not a stack trace.

### 4.2 Auth & security
- [ ] Valid learner/teacher/admin login; invalid login rejected without enumeration.
- [ ] Session survives refresh and navigation; logout revokes and returns to login.
- [ ] Change-password flow works for a temp-password account (or is verified via API contract).
- [ ] 6 rapid failed logins → `429` with `Retry-After`; correct login after window works.
- [ ] Mutating request with a foreign `Origin` → `403 origin_not_allowed`; same-origin works.
- [ ] Unauthenticated protected route redirects to login.
- [ ] Learner cannot read another learner's attempts/submissions through the API.

### 4.3 Gates & global instruments
- [ ] Fresh learner without consent sees the consent explanation and no course.
- [ ] Admin can set consent; audit event is written.
- [ ] Consent + unsubmitted learner reaches only the Pre-Test.
- [ ] Global 50-item Pre-Test renders 50 items in one language, submits once, stores version/language/score.
- [ ] Second Pre-Test submit is rejected.
- [ ] After submit, the course map opens; content is unreadable before submit.

### 4.4 Course & chapter loop
- [ ] Course map lists chapters 01–09 in order; chapter-01 open, 02–09 locked.
- [ ] Chapter pre-test: 10 items, one language, one attempt.
- [ ] Lesson player: steps navigate, progress updates, focus moves, mini-check gives correct/incorrect feedback and never gates/XP.
- [ ] Knowledge Mission: pass/fail, feedback, XP once, retry allowed.
- [ ] Chapter post-test: failing score leaves the next chapter locked; passing retry unlocks it; first score preserved; XP/badges once.
- [ ] Legacy archived module/lesson/practical URLs show unavailable to a learner.
- [ ] No practical/upload/review entry point appears in the learner or teacher journey.

### 4.5 Final instruments & research
- [ ] Final Test unlocks only after nine chapters are cleared.
- [ ] Final Test: 50 items, first attempt preserved, retry recorded separately, best shown, reward once, badge once.
- [ ] Survey renders and submits once; no answer key; legacy practical wording is flagged for #61.
- [ ] Research export CSV/XLSX/SQL includes chapter results, mission results, pretest/posttest versions and scores.
- [ ] PDF summary renders the same totals.

### 4.6 Gamification & roles
- [ ] XP ledger total, level and leaderboard order match the events.
- [ ] Badges page shows only earned badges; badge awards are unique.
- [ ] Teacher progress page shows chapter progress; review queue is unavailable.
- [ ] Admin users/consent/role/provisioning/publication/audit/health pages load and act.

### 4.7 Bilingual correctness
- [ ] For every major page, `/th` renders Thai UI and Thai DB content only; `/en` renders English only.
- [ ] Instrument pages render one prompt per item (no Thai+English duplicate blocks).
- [ ] No raw keys (`namespace.key`), no `{placeholder}` leakage, no mixed-language fallback sentences.
- [ ] Language selector: switch changes the URL prefix and copy immediately.
- [ ] Locale choice persists across navigation, refresh, logout and re-login (cookie + profile).
- [ ] `Accept-Language` alone never overrides an explicit choice; a fresh visitor defaults to Thai.
- [ ] Dynamic routes keep their path and params when switching locale.

### 4.8 Accessibility & responsive
- [ ] Existing axe/a11y specs pass in both locales.
- [ ] Keyboard: skip/nav/selector/forms reachable; visible focus.
- [ ] 360px, 768px and 1280px: no horizontal scroll or overlapping HUD/nav.
- [ ] `prefers-reduced-motion` stops non-essential animation.

### 4.9 Reliability
- [ ] Reloading after a submit does not duplicate attempts/rewards.
- [ ] A transient network failure shows a state, not a crash.
- [ ] No hydration mismatch or console error on the major pages.

## 5. Execution

1. Apply the optimization changes; run the local gate (typecheck, lint, unit+seam, build, Playwright).
2. Deploy to production; wait for the deployment to be Ready.
3. Run this checklist with authenticated production sessions for `th` and `en`, using the seeded accounts.
4. Capture TTFB (median of 3) before/after in a results table.
5. Fix every failed item and re-run until all pass.
6. Record results in `docs/testing/production-test-results.md` (or the PR body) and keep the plan as the regression checklist.

## 6. Out of scope

- Load/soak testing beyond a few concurrent requests.
- Changing the Vercel plan or Supabase region (recorded as an owner decision if region pinning is unavailable on Hobby).
- Research-instrument content approval (#61).
