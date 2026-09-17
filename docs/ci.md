# CI gates

`.github/workflows/ci.yml` runs six jobs on every PR into `dev`/`main` and on
push to `dev`. All working directories default to `web/`. Vercel builds and
deploys the app; this workflow only gates merges, so it stays cheap: no paid
runners, ~5-6 min total wall time across jobs (they run in parallel).

| Job | Protects against | Run it locally |
|---|---|---|
| `check` (tsc + tests) | Type errors, broken behavior | `cd web && npx tsc --noEmit && npm test` |
| `migrations` | A migration that doesn't actually build the schema from zero | `cd web && DATABASE_URL=... DIRECT_URL=... npx prisma migrate deploy` against an empty local Postgres |
| `style` | Emoji/dingbats and em dashes creeping into UI copy (FOUNDATION law) | `cd web && node scripts/check-style.mjs` |
| `eslint` | New lint errors (a fixed baseline of pre-existing ones is allowed) | `cd web && npx eslint src --max-warnings 9999` |
| `bundle` | Client JS bundle regressions on the heaviest routes | `cd web && npx next build && node scripts/check-bundle.mjs` |

## style: `scripts/check-style.mjs`

Scans `web/src/**/*.{ts,tsx}`, `web/prisma/seed*.ts` and
`web/scripts/content-fixtures.mjs` for emoji/dingbats, em dashes (U+2014,
always banned) and en dashes used as a word-separating dash (U+2013 with a
space on both sides — a `2020–2021`-style range between digits is fine).
Comments (`//`, `/* */`, JSDoc) are stripped before scanning so prose in
comments never trips it; string and template literals are scanned as-is.

A small `ALLOWLIST` array at the top of the script exempts specific
`(file, glyph)` pairs with a one-line reason each (a test fixture, an
internal-only webhook string, a content-parser regex that matches literal
markers in imported text rather than UI copy). Any file matched by
`*.test.*` is exempt outright. Don't add to the allow-list to silence a real
UI-copy violation — reword instead (em dash → colon, comma, or split the
sentence).

Exit 0 with `style: clean (N files scanned)`, or exit 1 with a
`file:line: <glyph> <line>` list.

## bundle: `scripts/check-bundle.mjs` + `perf-budget.json`

The `bundle` CI job spins up the same throwaway Postgres service container as
`migrations`, runs `prisma generate` + `migrate deploy` (so pages that query
the DB at build time can prerender), then `npx next build`, then the script.

The script reads each budgeted route's Turbopack `page_client-reference-
manifest.js` (Next 16/Turbopack emits this per-route RSC manifest instead of
the older webpack `app-build-manifest.json`), collects every client chunk it
references, sums their on-disk size under `.next/static`, subtracts the
chunks shared by every route (`.next/build-manifest.json`'s `rootMainFiles` +
`polyfillFiles`, budgeted once as `shared`), and compares the remainder to
`maxKB` in `perf-budget.json`. It fails with a route/budget/actual/delta
table when any route (or the shared baseline) is over budget by more than 2%.

Budgeted routes: `/marketing`, `/marketing/[id]`, `/marketing/live`,
`/outreach`, `/drive`, `/leads` — the heaviest client bundles in the app as of
2026-09-17. Add a route to `perf-budget.json` the same way if another one
becomes worth watching.

### Updating the budget deliberately

A route legitimately grows (a new dependency, a bigger feature) and `bundle`
fails: don't just raise the number to make it pass in the same PR that grew
it. Instead:

1. Build locally: `cd web && DATABASE_URL=... DIRECT_URL=... npx next build`
   (any reachable Postgres migrated with `prisma migrate deploy` works — the
   build only needs a schema to prerender against, not production data).
2. Run `node scripts/check-bundle.mjs` and read the `actual(KB)` column for
   the route that grew.
3. Edit `perf-budget.json`'s `maxKB` for that route to the new actual size
   plus ~10% headroom (matching how the current numbers were seeded), and say
   why in the PR description.

## eslint baseline

`eslint.config.mjs` has one override block, dated and reasoned in its own
comment, that downgrades exactly three rules
(`react-hooks/set-state-in-effect`, `react-hooks/purity`,
`react/no-unescaped-entities`) to `"warn"` for a fixed list of pre-existing
files. CI runs `npx eslint src --max-warnings 9999`, so those warnings stay
visible without failing the build, while any *new* error (in those files, on
any rule, or anywhere else in the tree) still fails it. Don't add files to
that list — fix the component, or ask before widening the baseline.
