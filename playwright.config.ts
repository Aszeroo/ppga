import { defineConfig } from '@playwright/test'

/**
 * PPGA #18 (the verification ticket): the Playwright seam. The critical
 * journey + the Teacher-review sub-journey + the accessibility sweep + the
 * responsive sweep + the language persistence run here against the REAL
 * app (`next start`) + the REAL database (`supabase start` + `db reset`),
 * never a mocked outcome.
 *
 * Projects carry BOTH languages: `th` and `en` run the SAME journey spec —
 * the same helper steps under a different locale/learner per project
 * (th → Learner One `64110001`, en → Learner Two `64110002`), so the
 * journey is green in CI in both languages, one shard, no per-pixel
 * snapshots (CI time stays sane: a single worker — the journey mutates the
 * SHARED live database, so it must run alone; the reset in `globalSetup`
 * gives every run a known baseline, hermetic across re-runs).
 *
 * The webServer REUSES the started app: CI (`ci.yml`) runs
 * `npm run build` + then let this `webServer` launch `npm run start` (the
 * `.env.local` the workflow writes from `supabase status -jq` carries the
 * LOCAL stack's deterministic keys). Locally the developer may start their
 * own server first — `reuseExistingServer` keeps it.
 */
export default defineConfig({
  testDir: './test/e2e',
  globalSetup: './test/e2e/global-setup.ts',
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? undefined : [['list', { printSteps: true }], ['html', { open: 'never', outputFolder: 'test/e2e/report' }]],
  projects: [
    {
      name: 'th',
      use: { locale: 'th', learner: '64110001' },
    },
    {
      name: 'en',
      use: { locale: 'en', learner: '64110002' },
    },
  ],
  use: {
    baseURL: process.env.PPG_E2E_BASE_URL ?? 'http://127.0.0.1:3000',
    trace: 'on-failure',
  },
  webServer: {
    command: 'npm run start',
    cwd: __dirname,
    port: 3000,
    reuseExistingServer: true,
    timeout: 180000,
  },
})
