#!/usr/bin/env bash
# Local CI gate (GitHub Actions is unpaid): run from the repo or a worktree root, on the committed HEAD.
#   /home/aron166/Projects/workspace/tools/ci-guard.sh scripts/local-ci.sh
# Steps: prisma generate, tsc, eslint on files changed vs origin/dev, vitest, next build (Turbopack, as Vercel builds;
# `next build --webpack` fails on dev: node:crypto reached by a client component via campaigns/rules.ts).
# Log: ~/.cache/<checkout dir name>-local-ci/local-ci-<full sha>.log (also under ndt-crm-local-ci), last line
# `LOCAL-CI-GATE PASS|FAIL <full sha>`, which workspace/tools/review-ready.sh reads.
set -u
root=$(git rev-parse --show-toplevel) || exit 2
sha=$(git -C "$root" rev-parse HEAD)
name=$(basename "$root")
dirs=("$HOME/.cache/$name-local-ci" "$HOME/.cache/ndt-crm-local-ci")
mkdir -p "${dirs[@]}"
log="${dirs[0]}/local-ci-$sha.log"
[ -z "$(git -C "$root" status --porcelain -- web | grep -v '^?? web/.env$')" ] || { echo "dirty tree: commit first (the gate is for a SHA)"; git -C "$root" status --short; exit 1; }
cd "$root/web" || exit 2
{
  echo "local-ci-gate sha=$sha $(date -Is)"
  npx prisma generate >/dev/null 2>&1 && npx tsc --noEmit && echo "tsc ok" \
   && { files=$(git -C "$root" diff --name-only --diff-filter=AM origin/dev...HEAD -- 'web/src/*.ts' 'web/src/*.tsx' | sed 's#^web/##'); \
        if [ -n "$files" ]; then npx eslint $files; else true; fi && echo "lint ok (changed files: $(echo $files | wc -w))"; } \
   && { npx vitest run 2>&1 | tail -8; [ "${PIPESTATUS[0]}" -eq 0 ]; } \
   && { npx next build 2>&1 | tail -5; [ "${PIPESTATUS[0]}" -eq 0 ]; } \
   && res=PASS || res=FAIL
  echo "LOCAL-CI-GATE $res $sha"
} > "$log" 2>&1
for d in "${dirs[@]:1}"; do cp "$log" "$d/"; done
tail -12 "$log"
