# Whole-codebase review — second opinion (for Codex)

You are reviewing `web/` of a Next.js App Router + Prisma + Supabase (Postgres) CRM,
deployed on Vercel from the `dev` branch (merging to dev = production). Two-person
company, one tenant in production today, but the schema is multi-tenant and the
software is meant to be sold later. The next 4 weeks are about a sales pipeline
(lead kanban, call-outcome logging, automations, HTTP API for external agents).

Read `CLAUDE.md`, `ADR/`, `prisma/schema.prisma`, `src/lib/`, `src/actions/`,
`src/app/api/`, and the tests before writing anything.

## What I want from you
A ranked list of findings, most severe first. For each: `file:line`, severity
(critical / high / medium / low), what is wrong, the concrete failure scenario, and
the smallest fix. Then a short "what I would delete or simplify" section. No essays,
no restating what the code does, no praise.

## Look hardest at
1. **Tenant scoping.** Every Prisma query in actions, route handlers, and lib must
   filter by `tenantId`. Find any that don't. Find any where the tenant comes from
   user input instead of the session or the API key.
2. **API route auth.** `src/app/api/**`: which routes are reachable without a valid
   session or app key? Is the app-key check consistent (`lib/hub/ingest-auth.ts`)? Any
   route that trusts a body field to decide identity?
3. **Server actions as an attack surface.** Which exported server actions lack Zod
   validation or an auth check? Any that accept an id and mutate without verifying it
   belongs to the caller's tenant?
4. **Unbounded queries and N+1.** Any `findMany` without `take`, list pages without
   pagination, loops that query inside. Lead/company/person lists especially.
5. **Migration safety.** Read `prisma/migrations/` in order. Anything destructive,
   non-idempotent, or that would lock a large table? Any drift between schema and
   migrations?
6. **Append-only interactions and audit log.** The rule is interactions are never
   updated or deleted and every mutation is audited. Find violations or gaps.
7. **Secrets and config.** Anything that could leak to the client bundle
   (`NEXT_PUBLIC_` misuse, secrets in RSC props), credentials logged, `.env` handling.
8. **Error handling.** Swallowed errors, `catch {}` with no report, places where a
   failed write returns success to the UI.
9. **Automation engine** (`src/lib/automations/`): race conditions on the cron,
   double-firing, idempotency of `send_email`, what happens when an action throws mid-run.
10. **Tests.** What is tested vs what matters. Name the 5 highest-risk untested paths.

## Known and accepted, do not report
- Row-level security is not enforced; app-level `tenant_id` scoping is the guard.
- `TENANT_ID = 1` is hardcoded in places; tenant decoupling is a planned project.
- Error reporting uses a native `instrumentation.ts` hook + webhook, not Sentry.
- Prisma is used despite an old doctrine saying no ORM.

## Style
Assume the reader is the lead dev. Be specific, be short, prefer deleting code over
adding it. If two findings share a root cause, report the root cause once.
