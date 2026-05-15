# Permanent Decisions — Helm CRM

These are locked. Don't re-debate them. If something feels wrong, raise it with Áron — don't silently work around it.

## Data model (permanent, never change)

1. **Person ≠ Contact.** Person = permanent human entity. Contact = person at company, time-bounded state. Collapsing these destroys relationship capital when people change jobs. The NDT market is small and relationship-driven — Kovács Béla moving from Company A to B must not break the relationship history.

2. **Interactions are append-only.** Never `UPDATE` or `DELETE` an interaction row. Append a new one. Full history must be preserved.

3. **Everything is a task.** Tasks are atomic. "Write email" and "send email" = two tasks, not one. `estimatedMinutes` vs `actualMinutes` on every task — measurability is the point.

4. **Timestamps on everything.** `createdAt`/`updatedAt`/`completedAt` on every business entity. Every state change is recorded.

5. **Multi-tenant from day one.** Every query must be scoped to `tenant_id`. Supabase RLS enforces this at DB level. Never write a query without a tenant scope.

6. **VAT number as company dedup key.** Names have spelling variants. `vat_number` doesn't. Use it.

7. **Prisma over raw SQL.** Type safety + migrations + DX. Only use `queryRaw` when Prisma can't express the query (e.g., `pg_trgm` similarity, complex aggregates). Cast raw results explicitly — no implicit `any`.

8. **TypeScript everywhere.** No Python. ETL is TypeScript. If something requires Python, question the premise.

## Stack decisions (resolved 2026-05-11, don't revisit)

- Next.js App Router over NestJS + Vite split. One process. Server actions. One deploy.
- Supabase Auth over custom JWT/bcrypt. Sessions + magic link out of the box.
- Native Postgres + Supabase over Docker. Docker Desktop was broken and the indirection had no payoff.
- NDT Brokerage is a **separate product** — don't model it here, don't reserve schema for it.
- Custom field storage: **JSONB on the entity row** (`deals.custom_fields`, `companies.custom_fields`) + definition table with GIN index.

## What NOT to do

- Never put business logic in a React component — use server actions in `app/actions/`
- Never call Prisma from a page component — always via server actions or route handlers
- Never skip `tenant_id` on any query
- Never use `any` in TypeScript — define the type
- Never update or delete an interaction — append a new one
- Never collapse Person and Contact into one table
- Never commit `.env` files
- Never push directly to `main` or `dev`
- Never start a new step until the previous step is merged to `dev` and verified in browser
- Never add error handling or validation for scenarios that can't happen — trust server action guarantees at internal boundaries
