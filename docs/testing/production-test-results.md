# Production test results — performance & bilingual pass

Date: 2026-11-17. Target: `https://ppga.vercel.app`, `main@f56d44b`.
Plan: [`production-test-plan.md`](production-test-plan.md).

## Result

- **Production checklist: 72/72 passed** (public, auth, learner CAI pages, instruments, admin/teacher, security, exports, DB state).
- **Browser locale test: 10/10 passed** (switch, `lang`, dynamic params, reload, logout/login).
- **Instrument language isolation: passed** — Thai pages show Thai prompts only; English pages show English prompts only; 50/50 items on the global pre-test and final test, 10/10 on chapter tests.
- **CI**: Typecheck, Tests and Critical journey E2E are green on the final commit of this branch, rebased onto `main@ef4daa6` (which includes the `lessonPlayer` namespace fix from #112).
- **DB**: 37/37 migrations, active `presentation-program`, final first score 50 preserved, 1 retry record, XP 2,300, 4 badges, 1 survey response, zero residual corrupted Thai.

## Performance: baseline → after (median of 3 warm runs)

| Page | Baseline TTFB | After TTFB | Budget |
|---|---|---|---|
| `/api/health` | 2.36s | **0.67s** | ≤ 0.6s (marginal) |
| `/th/login` | 2.24s | **0.41s** | ≤ 0.8s |
| `/en/login` | 0.50s | **0.39s** | ≤ 0.8s |
| `/th` dashboard | 2.26s | **1.20s** | ≤ 1.2s |
| `/en` dashboard | 2.06s | **0.69s** | ≤ 1.2s |
| `/th/course` | 1.54s | **0.69s** | ≤ 1.0s |
| chapter test | 1.59s | **0.90s** | ≤ 1.2s |
| lesson | 2.12s | **1.19s** | ≤ 1.2s |

HTML weight dropped as well:

| Page | Before | After |
|---|---|---|
| `/th/login` | 73,058 B | 37,084 B |
| `/en/login` | 45,224 B | 26,189 B |
| `/th` | — | 50,269 B |
| `/en` | — | 38,007 B |

## What changed

1. One language per instrument item; removed the Thai/English prompt stack.
2. Removed the cross-locale message merge; a missing key uses the human-readable fallback, never the other language.
3. Locale switch keeps `document.documentElement.lang` in sync and preserves dynamic-route params (`/course/chapter-01`), and the profile update uses `keepalive`.
4. Shared per-request session client + React `cache()` for profile/XP; profile and XP read in parallel.
5. Chapter-progress and hub reads parallelized; retired practical query removed.
6. Pre-test/Final Test gate, state and items read in one wave.
7. Client HTML serializes only the 11 message namespaces used by Client Components.
8. CI pins Supabase CLI `2.117.0` (the `latest` lookup hit a GitHub rate limit).

## Caveats / owner decisions

- **Function region:** production still reports `x-vercel-id: sin1::iad1`. The Vercel project is on **Hobby**, which ignores `preferredRegion`; the code keeps the `sin1` preference so it takes effect if the plan changes. Upgrading the plan is the remaining lever for another ~300–500 ms on DB-bound pages.
- `/api/health` is a live Postgres probe and sits just above its 0.6 s target (0.67 s median, with cold-start outliers). It is not user-facing in the learning loop.
- Full fresh-CAI-loop coverage is provided by the CI Playwright journey; this production pass verified the deployed pages, instruments, security and persisted research state. Admin mutation surfaces were not all re-exercised (consent was verified earlier); local seam tests cover them.
- Native-speaker Thai sign-off and the `#61` instrument approval remain owner decisions.
