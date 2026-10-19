#!/usr/bin/env bash
# verify-production.sh — read-only production health probe (issue #64).
#
# Checks only PUBLIC endpoints and public DNS: no credentials, no secret
# values, nothing it reads or prints can leak a key (it never opens env
# files). Safe for anyone, any time; run it after every deploy.
#
# Usage:
#   scripts/verify-production.sh [supabase-project-ref]
#
# Exit codes: 0 all automated checks pass, 1 some failed, 2 unreachable host.
set -u

BASE="${PPGA_PROD_URL:-https://ppga.vercel.app}"
REF="${1:-}"
fails=0

hr() { printf -- '----------------------------------------\n'; }
fail() { printf 'FAIL %s\n' "$1"; fails=$((fails + 1)); }
warn() { printf 'WARN %s\n' "$1"; }
pass() { printf 'PASS %s\n' "$1"; }

fetch() { curl -sS -m 20 "$1" 2>/dev/null; }

hr; echo "1) $BASE/api/health"
health="$(fetch "$BASE/api/health")"
if [ -z "$health" ]; then
  fail "no response from $BASE/api/health (network/DNS problem reaching $BASE)"
  exit 2
fi
echo "   $health"
case "$health" in
  *'"status":"ok"'*)
    pass "data layer ok" ;;
  *'"status":"not-configured"'*)
    fail "SUP_URL / SUP_SERVICE_ROLE_KEY missing on the Production scope (#48 mode) — re-set + redeploy: runbook §1" ;;
  *'fetch failed'*)
    fail "variables set but the Supabase host is unreachable — project paused/deleted or stale ref: runbook §6.1" ;;
  *)
    fail "unexpected health payload: $(echo "$health" | head -c 200)" ;;
esac

hr; echo "2) $BASE/th — build generation + render sanity"
page="$(fetch "$BASE/th")"
if [ -z "$page" ]; then
  fail "no response from $BASE/th"
else
  if echo "$page" | grep -qE 'press_start_2p|noto_sans_thai|class="[^"]*\bppg-'; then
    pass "V3 build markers present (ppg- tokens / V3 font modules)"
  elif echo "$page" | grep -qE 'ta16bit_|mitr_[0-9a-f]{8}'; then
    warn "main-era (pre-V3) build markers (ta16bit/mitr fonts) — V3 only lands once PR #57 merges + production redeploys: runbook §5"
  else
    warn "unrecognised build generation; inspect the served HTML manually"
  fi
  title="$(echo "$page" | grep -o '<title>[^<]*</title>' | head -1)"
  echo "   title: ${title:-<none>}"
  if echo "$page" | grep -q 'NEXT_PUBLIC_SUP_\*_ missing'; then
    fail "browser-baked env fallback visible — build predates env vars (#48 mode): runbook §6.3"
  fi
fi

hr; echo "3) $BASE/en — locale reachability"
en="$(curl -sS -m 20 -o /dev/null -w '%{http_code}' "$BASE/en" 2>/dev/null)"
if [ "$en" = "200" ]; then pass "/en responds 200"; else fail "/en HTTP ${en:-no response}"; fi

hr; echo "4) Supabase project host DNS"
if [ -z "$REF" ]; then
  warn "no project ref given — rerun as: scripts/verify-production.sh <ref>"
  warn "(a ref is not a secret, but confirm it in the dashboard, never from memory: runbook §1)"
else
  host="$REF.supabase.co"
  if getent hosts "$host" >/dev/null 2>&1; then
    pass "$host resolves via the local resolver"
  else
    warn "$host unresolved locally — checking public resolvers"
  fi
  for r in "https://dns.google/resolve?name=$host&type=A" \
           "https://cloudflare-dns.com/dns-query?name=$host&type=A"; do
    ans="$(curl -sS -m 20 -H 'accept: application/dns-json' "$r" 2>/dev/null)"
    status="$(echo "$ans" | grep -o '"Status":[0-9]*' | head -1 | tr -dc '0-9')"
    case "$status" in
      0)  pass "$host resolves via a public resolver" ;;
      3)  fail "$host NXDOMAIN on a public resolver — subdomain gone (deleted/purged/renamed project or stale ref): runbook §6.1" ;;
      *)  warn "$host resolver answer unclear (Status=${status:-n/a}) from $r" ;;
    esac
  done
  curl -s -m 15 -o /dev/null "https://$host/rest/v1/" 2>/dev/null \
    && warn "HTTP probe: $host answered — project host alive (paused projects usually still resolve; dashboard is authoritative)" \
    || true
fi

hr; echo "Automated checks: $([ "$fails" -eq 0 ] && echo 'all pass' || echo "$fails FAIL")"
echo "Owner-only checks this script cannot do (runbook reference):"
echo "  - vercel env ls production   → 4 names present (names only, never values) [§1]"
echo "  - npx supabase migration list --linked → 19 migrations, no drift          [§3]"
echo "  - select id, public from storage.buckets where id='ppg-submissions';      [§4]"
echo "  - real learner submits a .pptx on a Practical Mission, signed-URL read    [§4]"
[ "$fails" -eq 0 ] && exit 0 || exit 1
