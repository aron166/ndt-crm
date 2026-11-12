#!/usr/bin/env bash
# Local CI gate (GitHub Actions is unpaid): run from the repo or a worktree root, on the committed HEAD.
#   /home/aron166/Projects/workspace/tools/ci-guard.sh scripts/local-ci.sh
#   scripts/local-ci.sh --selftest      (proves a failing step gives a FAIL line and a non-zero exit)
# Steps: prisma generate, tsc, eslint on files changed vs origin/dev, vitest, next build (Turbopack, as Vercel builds;
# `next build --webpack` fails on dev: node:crypto reached by a client component via campaigns/rules.ts).
# Every step runs with DUMMY database and Supabase values, so no step can reach production even if web/.env holds the
# real ones (process env wins over .env files in Next, Prisma and Vitest). Integration tests bring their own DB and skip.
# Log: ~/.cache/<checkout dir name>-local-ci/local-ci-<full sha>.log (also under ndt-crm-local-ci), last line
# `LOCAL-CI-GATE PASS|FAIL <full sha>`, which workspace/tools/review-ready.sh reads. Exit code: 0 on PASS, 1 on FAIL.
set -u
if [ "${1:-}" = "--selftest" ]; then
  self=$(readlink -f "$0"); c=$(mktemp -d); trap 'rm -rf "$c"' EXIT
  LOCAL_CI_CACHE=$c LOCAL_CI_STEPS='true; false; true' "$self" >/dev/null; rc=$?
  last=$(tail -n 1 "$(ls "$c"/*-local-ci/local-ci-*.log | head -n 1)")
  [ $rc -ne 0 ] && [[ $last == "LOCAL-CI-GATE FAIL "* ]] || { echo "selftest FAIL: rc=$rc last='$last'"; exit 1; }
  rm -rf "$c"/*; LOCAL_CI_CACHE=$c LOCAL_CI_STEPS='true' "$self" >/dev/null; rc=$?
  last=$(tail -n 1 "$(ls "$c"/*-local-ci/local-ci-*.log | head -n 1)")
  [ $rc -eq 0 ] && [[ $last == "LOCAL-CI-GATE PASS "* ]] || { echo "selftest FAIL: rc=$rc last='$last'"; exit 1; }
  echo "selftest ok: failing step -> rc!=0 + FAIL line; passing -> rc=0 + PASS line"; exit 0
fi
root=$(git rev-parse --show-toplevel) || exit 2
sha=$(git -C "$root" rev-parse HEAD)
name=$(basename "$root")
cache=${LOCAL_CI_CACHE:-$HOME/.cache}
dirs=("$cache/$name-local-ci" "$cache/ndt-crm-local-ci")
mkdir -p "${dirs[@]}"
log="${dirs[0]}/local-ci-$sha.log"
[ -z "$(git -C "$root" status --porcelain -- web | grep -v '^?? web/.env$')" ] || { echo "dirty tree: commit first (the gate is for a SHA)"; git -C "$root" status --short; exit 1; }
cd "$root/web" || exit 2
export DATABASE_URL=postgresql://dummy:dummy@127.0.0.1:1/dummy DIRECT_URL=postgresql://dummy:dummy@127.0.0.1:1/dummy \
  NEXT_PUBLIC_SUPABASE_URL=http://127.0.0.1:1 NEXT_PUBLIC_SUPABASE_ANON_KEY=dummy SUPABASE_SERVICE_ROLE_KEY=dummy

lint() {
  git -C "$root" rev-parse --verify -q origin/dev >/dev/null || { echo "origin/dev not found: git fetch origin, then rerun"; return 1; }
  mapfile -t files < <(git -C "$root" diff --name-only --diff-filter=AM origin/dev...HEAD -- 'web/src/*.ts' 'web/src/*.tsx' | sed 's#^web/##')
  [ ${#files[@]} -eq 0 ] || npx eslint -- "${files[@]}" || return 1
  echo "lint ok (changed files: ${#files[@]})"
}
steps() {
  npx prisma generate >/dev/null 2>&1 && npx tsc --noEmit && echo "tsc ok" && lint \
    && { npx vitest run 2>&1 | tail -8; [ "${PIPESTATUS[0]}" -eq 0 ]; } \
    && { npx next build 2>&1 | tail -5; [ "${PIPESTATUS[0]}" -eq 0 ]; }
}
{
  echo "local-ci-gate sha=$sha $(date -Is)"
  if [ -n "${LOCAL_CI_STEPS:-}" ]; then bash -c "set -e; $LOCAL_CI_STEPS"; else steps; fi \
    && res=PASS || res=FAIL
  echo "LOCAL-CI-GATE $res $sha"
} > "$log" 2>&1
for d in "${dirs[@]:1}"; do cp "$log" "$d/"; done
tail -12 "$log"
[ "$(tail -1 "$log")" = "LOCAL-CI-GATE PASS $sha" ]
