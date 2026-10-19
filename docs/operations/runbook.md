# PPGA Operations Runbook — hosted deployment (Vercel + Supabase)

Scope: everything an operator must know to keep the **hosted** environment
healthy — Vercel project, Supabase project, migrations, the private storage
bucket, deploys, rollbacks, and the post-deploy checks. Local development is
covered in the README; this file assumes production credentials.

**Secret rule (applies to every command below):** secret *values* never appear
in tickets, commits, logs, shell history, or chat output — only variable
*names* and the non-secret project ref. Set values through the interactive
prompt or a redirect from a file outside the repo (`vercel env add NAME
production < /tmp/value.txt`); never `echo <value> | vercel env add` (it
lands in bash history).

## 1. Production inventory

| Item | Value |
|---|---|
| Vercel project | `ppga` — production alias `https://ppga.vercel.app` |
| Supabase project ref | read it from the Vercel env value or the dashboard. The ref recorded through #48 (`ywbpefrcepgvkgchruhk`, host `ywbpefrcepgvkgchruhk.supabase.co`) **did not resolve DNS on 2026-10-19** — treat it as stale until verified (§6.1). A project ref is not a secret, but do not treat a remembered ref as current. |
| Redesign preview alias | `https://ppga-redesign.vercel.app` (serves PR #57's branch; behind Vercel Deployment Protection — log in with the Vercel team account) |
| Repo → production flow | push/merge to `main` builds on Vercel; `middleware.ts` (Next 16, deprecated in favour of `proxy.ts` — see README) runs per request |

### Required environment variables (names only)

Defined by `.env.example`; every one of these must exist on the **Production**
scope of the Vercel project (and on Preview/Development for branch deploys):

| Variable | Reaches browser? | Notes |
|---|---|---|
| `NEXT_PUBLIC_SUP_URL` | yes | bundled **at build time** — changing it requires a redeploy to take effect |
| `NEXT_PUBLIC_SUP_ANON_KEY` | yes | the only key that may reach the browser; also baked at build time |
| `SUP_URL` | no | server-side (health probe, admin/service-role calls); snapshotted per deployment |
| `SUP_SERVICE_ROLE_KEY` | no | server-side only (`lib/sup/server.ts` carries `import 'server-only'`; ESLint bans browser use) |

`vercel env ls` gotcha (learned during #48): the default listing can hide
per-scope rows — **always** filter by scope before concluding a variable is
missing:

```bash
vercel env ls production
```

Expected: all four names present for `Production`. Missing any of them is the
#48 failure mode (`/api/health` answers `not-configured`).

## 2. Health checks — run after EVERY deploy

The fastest public probe is the read-only script (no credentials, no secrets,
safe in CI):

```bash
scripts/verify-production.sh [project-ref]
```

Manual equivalents:

```bash
curl -s https://ppga.vercel.app/api/health
```

| Response | Meaning | Action |
|---|---|---|
| `{"status":"ok", ...}` | data layer healthy | continue render checks |
| `{"status":"not-configured", ...}` | `SUP_URL`/`SUP_SERVICE_ROLE_KEY` missing on the Production scope | re-set (§1), then redeploy |
| `{"status":"error","detail":"TypeError: fetch failed"}` | variables exist but the Supabase host is unreachable (DNS/dead/paused project) | §6.1 |
| `{"status":"error","detail":"ppg_health returned no rows"}` | migrations not applied (baseline `20260925000000_health_table.sql` missing) | §3 |

Then eyeball the rendered pages:

- `https://ppga.vercel.app/th` and `/en` — styled app shell (header, HUD,
  locale selector), **not** raw unstyled HTML (raw HTML = the `NEXT_PUBLIC_*`
  bake-time problem, §6.3), and not the degraded "no session" fallback.
- `https://ppga.vercel.app/th/health` — renders the ok state (it runs the same
  `ppg_health` probe server-side).
- If a build change is being verified, confirm the build generation: V3 pages
  reference `ppg-` design classes and the `press_start_2p`/`noto_sans_thai`
  font modules; main-era pages reference `ta16bit`/`mitr` (§5).

## 3. Supabase: link, migrate, verify (no drift)

Commands run from the repo root (the `supabase` npm dev-dependency provides
the CLI via `npx`):

```bash
npx supabase login                      # or SUPABASE_ACCESS_TOKEN env var in CI
npx supabase link --project-ref <ref>   # ref from the dashboard, §1
npx supabase migration list --linked    # remote history vs local files
npx supabase db push --dry-run          # what would be applied
npx supabase db push                    # apply
```

`migration list` must show the **19** repo migrations
(`supabase/migrations/20260925000000_health_table.sql` … baseline through
`20261002000100_review_target_learner.sql`) as applied, with no `≠`/missing
rows on either side. If the remote history table diverged (e.g. migrations
applied before the CLI tracked them), `npx supabase db push --include-all`
replays everything not in the remote history — review first with
`--dry-run`, and never hand-edit remote schema ("never modify the remote
database directly").

Drift can also surface as health `error` with a Postgres message about a
missing column/table even though `/api/health` answers — fix by pushing the
migration, not by patching the dashboard SQL console ad hoc.

## 4. `ppg-submissions` bucket (private) — one-time, verify every incident

Practical-Mission uploads target the private bucket `ppg-submissions` with
object paths `submissions/{learnerId}/{missionId}/{submissionId}` (the
append-only design forbids updates/deletes; reads go through short-lived
signed URLs — never public).

Two provisioning paths exist:

1. **Migrations** — `supabase/migrations/20260926001000_practical_missions_submissions.sql`
   creates the bucket idempotently (`insert into storage.buckets … on conflict
   do nothing`) plus the three storage RLS policies, so a clean `db push` (§3)
   provisions it.
2. **Dashboard, if it is missing anyway** (push interrupted, or an older
   project predates #13): Storage → New bucket → name `ppg-submissions`,
   **private**. Then re-run §3 so the policies apply; policies only work
   against the exact bucket id.

Verify both (SQL editor on the hosted project):

```sql
select id, public from storage.buckets where id = 'ppg-submissions';
-- expect exactly one row, public = false

select policyname from pg_policies
 where schemaname = 'storage' and tablename = 'objects'
   and policyname like 'ppg_submissions%';
-- expect three rows: ppg_submissions_write_own_prefix,
-- ppg_submissions_read, ppg_submissions_owner_delete_denied
```

Functional proof (acceptance for #64): log in with a real learner account on
production, submit a `.pptx` on a Practical Mission, see the pending state,
then download it via the signed URL as teacher/admin. A 4xx/5xx on upload
means the bucket or policies are missing (§4.2) or the session's role fails the
path check (policies enforce `split_part(name,'/',2) = auth.uid()`).

## 5. Deploy & rollback

- **Normal deploy:** merge to `main` → Vercel auto-builds and promotes to
  `ppga.vercel.app`. From a checkout: `vercel deploy --prod` (reads the
  project link; token interactively or via `VERCEL_TOKEN`, never committed).
- **Redeploy without new code** (e.g. after fixing an env var — required
  because `NEXT_PUBLIC_*` bake at build time and server vars snapshot per
  deployment): `vercel redeploy <full-deployment-id>` — use the *full* id from
  `vercel ls` or the dashboard; truncated ids fail with "Can't find the
  deployment".
- **Rollback:** `vercel rollback` switches the production alias back to the
  previous deployment (`vercel rollback <deployment-url>` for a specific one;
  or the dashboard's deployment list → ⋯ → "Roll back to this deployment").
  Rollback does not touch the database — if the code being rolled back predates
  applied migrations, verify health after rolling.
- **Restore a known-good build** (alias serving the wrong generation): find
  the deployment by its commit sha in `vercel ls`, then
  `vercel redeploy <full-deployment-id>` and confirm the alias updated.

Serving the V3 redesign on the live URL additionally requires PR #57
(#50–#56 branch) to be merged first — production on `main` is main-era by
design until it lands (issue #64).

## 6. Known failure modes (all observed on this project)

### 6.1 Supabase host unreachable — paused vs deleted vs stale ref

`/api/health` answers `{"status":"error","detail":"TypeError: fetch failed"}`
while the four variables are set. The server client cannot reach the project
host. Signals (the script in §2 reports all three):

```bash
getent hosts <ref>.supabase.co    # or: python3 -c "import socket;socket.gethostbyname('<ref>.supabase.co')"
curl -s "https://dns.google/resolve?name=<ref>.supabase.co&type=A" | head -c 400
```

- **NXDOMAIN** (`Status: 3`) on the project host while `supabase.co` itself
  resolves — the 2026-10-19 state — means the subdomain is gone: a deleted and
  purged project, a project renamed (new ref), or a stale ref in `SUP_URL`.
  DNS is a heuristic, not proof — the **dashboard is authoritative**: the
  organization's project list shows `Paused` (Restore button), a new ref, or no
  project at all.
- **Resolves but requests fail / dashboard shows `Paused`**: free-plan pause
  usually keeps DNS alive. Pause → Restore from the dashboard (takes minutes),
  then re-run §2.
- **Project exists but `SUP_URL` points elsewhere**: copy the current ref from
  the dashboard into §1's env procedure, redeploy.
- Deleted/purged: create a new project, `link` + `db push` (§3), reseed
  content, recreate the bucket path (§4), re-point all four variables (§1),
  redeploy. Treat data loss as a separate owner decision — nothing here
  restores a purged project's rows.

### 6.2 "Resource provisioning failed" (no build log, `builds: []`)

A Vercel platform-side failure, not a code failure (seen 2026-10-02, ≥5.4 h
across 13 attempts including known-good production code). Diagnose by
redeploying the last known-good deployment (§5). If a known-good commit fails
identically, it is platform-side — `status.vercel.com` can read all-green
because per-project capacity problems aren't listed. Retry periodically; only
touch code once the failure follows a *specific* commit.

### 6.3 Raw unstyled HTML / "NEXT_PUBLIC_SUP_* missing" fallback

The aliased build predates the variables landing on the Production scope
(`NEXT_PUBLIC_*` bake at build time — history of #48). Re-set the variables
(§1), then **redeploy** — a plain environment push is not enough. If a
production build is old *and* pre-V3, §5's restore applies.

### 6.4 `ppg-submissions` missing on hosted environments

`supabase/seed.sql` provisions the bucket only for the local `db reset` flow;
hosted projects rely on the migration insert (§4). Practical-Mission uploads
fail without it — verify with §4's SQL after any project restore/creation.

## 7. Incident 2026-10-19 — owner restore checklist

External input required (owner credentials); ordered, with expected results:

1. Supabase dashboard → confirm the production project's fate (paused / new ref
   / deleted) — §6.1 decides the path. If paused: Restore; if gone: create a
   project and note the ref.
2. `vercel env ls production` → all four names (§1). Re-add/update values from
   the dashboard's API settings (anon + service-role keys) per §1's secret rule;
   if the ref changed, **all four** values change.
3. `npx supabase link --project-ref <ref>` then
   `npx supabase migration list --linked` → 19 migrations applied (§3);
   `npx supabase db push` if not.
4. SQL editor: `select ok from ppg_health limit 1;` → one row. (If the project
   was recreated, also re-seed content — §6.1.)
5. Bucket + policies check — §4.
6. `vercel redeploy <full-deployment-id>` (env vars snapshotted; §5).
7. `scripts/verify-production.sh <ref>` → expect `{"status":"ok", ...}`,
   styled `/th` + `/en`, NXDOMAIN gone.
8. Real submission round-trip — §4's functional proof.
9. V3 on the live URL only after PR #57 merges to `main` (§5); until then
   production serves the main-era build by design.
10. Update this runbook's §1 ref table when the ref is reconfirmed; comment
    verification results (statuses only, never values) on issue #64.
