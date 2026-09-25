# PPGA — Gamified PowerPoint Learning Platform

A bilingual (Thai/English) gamified web platform for ปวช.2 vocational learners to build real Microsoft PowerPoint presentation-creation skills.

## Stack

Next.js (App Router, TypeScript) + Supabase (Auth, Postgres, Storage), GitHub → Vercel. Zod validation later; Vitest, React Testing Library, Playwright.

## Scripts

- `npm run dev` — Next.js dev server (local dev)
- `npm run build` — production build (Vercel build step)
- `npm run start` — serve production build
- `npm run lint` — ESLint flat config (env/secret guards)
- `npm run typecheck` — `tsc --noEmit`
- `npm run test` / `test:watch` — Vitest
- `npm ci` — CI install path

## Supabase CLI migration workflow (dev/preview/prod)

The workflow lives in `supabase/`:

- `supabase/config.toml` — `supabase init`-style local configuration (`project_id = "ppga"`).
- `supabase/migrations/<timestamp>_name.sql` — schema as versioned migrations.
  The baseline `20260925000000_health_table.sql` creates the `ppg_health`
  table the health endpoints query.

Commands (run from the project root; the CLI is available via `npx supabase …`):

```bash
npx supabase init              # one-time: write supabase/config.toml
npx supabase start           # local Postgres (dev environment), seeds, UI
npx supabase migration new  # create a new migration file
npx supabase migration up   # apply local migrations to the local database
npx supabase link --project-ref <ref> # link to the hosted project (preview/prod)
npx supabase db pull        # capture an existing schema from the linked project
npx supabase db push        # push local migration changes to the linked project
```

Environment mapping:

- **dev** — `supabase start` local Postgres; run migrations with `supabase migration up`.
- **preview** — link to the Supabase preview project ref and `supabase db push`.
- **production** — link to the production project ref and `supabase db push`.

All three environments must get the same migrations; never modify the remote database directly.

## Environment secrets

Copy `.env.example` — the file documents every variable and is not committed itself.

- Browser-visible: `NEXT_PUBLIC_SUP_URL`, `NEXT_PUBLIC_SUP_ANON_KEY`.
  **Only the anon key reaches the browser.** Anything with the `NEXT_PUBLIC_`
  prefix is bundled for the client — nothing else may be.
- Server-only: `SUP_URL`, `SUP_SERVICE_ROLE_KEY`.
  The service-role key exists only server-side via environment variables.
  The scaffold enforces it two ways:
  1. `lib/sup/server.ts` carries `import 'server-only'` — a build-time guard
     if any Client Component imports it.
  2. `eslint.config.mjs` adds `no-restricted-imports` / `no-restricted-syntax`
     rules banning browser-context use of the server client factory and reading
     `SUP_SERVICE_ROLE_KEY` outside server-only files.

Secrets are provided by your deploy environment (Verc/Supabase project secret sets), never committed.

## Health page

- `/health` (App Router page) performs a real Postgres query via the server-side Supabase client and renders connectivity status with loading/empty/error states.
- `/api/health` (route) returns the same JSON shape for tooling.

## Vercel deployment (operator action, preview + production)

The framework is auto-detected by Vercel (Next.js). Deployment steps, documented here —
run when you have your Vercel credentials:

```bash
vercel deploy --preview --token <vercel-token>  # preview environment
vercel deploy --prod --token <vercel-token>  # production environment
```

Preview/production reachability is pending operator action; the scaffold is buildable,
runnable, and lint-checked locally.

## CI

`.github/workflows/ci.yml` runs `typecheck + lint` and `tests` on every push.
No secrets are committed; real-database tests are guarded by the presence of
`SUP_*` environment variables so the pipeline passes without credentials.

## Ticket #3 — Auth, roles & profiles

Authentication against the role model: Learners log in with provisioned
student-ID credentials, change their password, and log out. Roles (Learner /
Teacher / Admin) live on the profile (`ppg_profiles`) and are enforced by RLS
from day one; the first Admin is seeded by a migration, not hand-created in the
dashboard.

Routes:

- `/login` — student-ID handle + password (JSON POST to `/api/auth/login`)
- `/api/auth/login` — sign-in against the real Supabase Auth service; the token
  bundle lands in `httpOnly`, `SameSite=cuda` cookies on `/`.
- `/api/auth/logout` + `/logout` — the refresh token is revoked at the service
  and both session cookies are cleared.
- `/api/auth/change-password` + `/change-password` — PUT to the service; the
  weak-password / reauthentication / same-password gate renders verbatim.
- `/profile` — name + role only (Level/XP arrive later); the row is read from
  Postgres with the user's own JWT so RLS decides what the user may see.
- `middleware.ts` guards `/profile`, `/change-password`, `/logout`: an
  unsigned request redirects to `/login` (the unauthorized state), never a
  blank screen.

### Seeded credentials (documented, NOT real secrets)

`20260925000110_seeds.sql` inserts these rows into `auth.users` (the trigger
materialises each `ppg_profiles` row; role and student-ID come from
`raw_user_meta_data`). Use them only against `supabase start`'s local instance.

| Handle (login identifier) | Password (local-only) | Role |
|---|---|---|
| `admin` | `ppga-test-2026` | admin |
| `teacher` | `ppga-test-2026` | teacher |
| `64110001` | `ppga-test-2026` | learner |
| `64110002` | `ppga-test-2026` | learner |
| `64110003` | `ppga-test-2026` | teacher |

The handle maps to a synthetic email `<handle>@ppga.local` — Supabase Auth
treats the student-ID as the login identifier without requiring a real email.
No `signup` route, page or API exists: self-registration is blocked by RLS's
insert policy (`admin` only) and by the absence of any self-registration
surface.