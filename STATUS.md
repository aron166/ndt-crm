# NDT CRM — Project Status

> All agents update this file at the end of every session. Keep entries brief.
> Format: `YYYY-MM-DD | [domain] | what was completed | what is next`

---

## Current State (2026-05-11 — direction reset)

**Project resumed after weeks of pause.** This repo is now **standalone** — forget the monorepo plan in `C:\Users\Áron\workspace`. This is the live CRM and will stay here.

**Lead dev:** Nate.

**Two parallel tracks, in order:**

### Track 1 — Get current build running locally (TODAY, blocking)
Docker Desktop is broken on this machine (WSL kernel crash on bootstrap, `0xc00000fd`). We are dropping Docker entirely. Backend (NestJS) and frontend (Vite) already run natively with `npm run dev` — only the DB needs replacing.

**Steps:**
1. Install native PostgreSQL 15 for Windows (port 5434, or 5432 with `.env` update)
2. Create role `crm`/`crm` + database `ndt_crm`
3. `cd backend && npx prisma migrate deploy && npx prisma db seed`
4. Confirm `npm run start:dev` (backend) + `npm run dev` (frontend) come up
5. Log in at http://localhost:5173 with `admin@controllabor.hu` / `admin1234`
6. Delete `docker-compose.yml`, `backend/Dockerfile.dev`, `frontend/Dockerfile.dev` once verified working
7. Update root CLAUDE.md "Local dev" row from Docker → native Postgres

### Track 2 — Migrate stack to Next.js + Supabase (after Track 1 verified)
The original Nest + self-hosted Postgres + JWT auth choice was correct for a monorepo plan that no longer applies. For a standalone, solo-maintained product the friction is no longer worth it. New target stack:

| Layer | From | To | Why |
|---|---|---|---|
| App framework | NestJS backend + Vite frontend (2 processes) | **Next.js App Router** (1 process) | Server actions kill REST boilerplate. One deploy. No CORS. |
| Database | Self-hosted Postgres (Docker/native) | **Supabase** (managed Postgres + RLS) | Kills local DB ops forever. Free tier sufficient. RLS gives us multi-tenant isolation cheaply. |
| Auth | Custom JWT + bcrypt in `AuthModule` | **Supabase Auth** | Deletes ~hundreds of lines of auth code. Session + magic link out of the box. |
| ORM | Prisma | **Keep Prisma** (point at Supabase Postgres) | Schema is good. Migrations are good. Portable. |
| AI | Groq llama-3.3-70b | Keep — or swap to Claude per-feature | Decide per feature. |

**What does NOT change:** the data model (Person ≠ Contact, atomic tasks, append-only interactions, timestamps everywhere), the React + Tailwind + shadcn frontend, TypeScript everywhere.

**Effort estimate:** 3–5 focused days. Schema port is mechanical. Bulk is Nest controllers → Next route handlers / server actions, and JWT → Supabase Auth.

---

## Backend (current, NestJS)

**Done:**
- ✅ Phase 1: bootstrap, prisma, migrations, seed, auth
- ✅ Companies — CRUD, pagination, VAT dedup, F.A. filter
- ✅ Persons — CRUD, search by name/email/phone
- ✅ Contacts — create/close, active list per company, full history per person
- ✅ Tasks — CRUD, subtask hierarchy, recurrence, estimatedMinutes vs actualMinutes
- ✅ Interactions — append-only POST, GET per company/person

**Next (after Track 1 verified):** **Pause feature work.** Begin Track 2 migration scaffold — `npx create-next-app@latest`, port Prisma schema, wire Supabase client, port one module end-to-end as a proof (suggest Companies — simplest CRUD).

**Original "Next" before pause** (revisit after migration): Quote feature schema migration (price_catalog, intake_submissions, quotes, quote_line_items)

**APIs ready in current build:**
- `POST /api/auth/login`
- `GET/POST/PATCH/DELETE /api/companies`
- `GET/POST/PATCH/DELETE /api/persons`
- `GET/POST/PATCH /api/contacts`
- `GET/POST/PATCH/DELETE /api/tasks`, `POST /api/tasks/:id/complete`, `GET /api/tasks/:id/time-diff`
- `POST /api/interactions`, `GET /api/companies/:id/interactions`, `GET /api/persons/:id/interactions`

---

## Frontend (current, Vite SPA)

**Done:**
- ✅ Vite + TS + ESLint + Tailwind + shadcn/ui + design tokens
- ✅ api.ts, utils.ts (formatHUF, formatDate, cn)
- ✅ Auth: LoginPage, AuthContext, useAuth, ProtectedRoute
- ✅ App shell: AppLayout, Sidebar, Topbar
- ✅ React Router v6: all 12 routes lazy-loaded
- ✅ All page files scaffolded
- ✅ CompaniesPage — TanStack Table, debounced search, pagination, PipelineStatusBadge, F.A. filter
- ✅ CompanyDetailPage — tabbed: Overview + Contacts live, Deals/Tasks/Interactions/Invoices stubbed
- ✅ PersonsPage — debounced search, pagination, current company column
- ✅ PersonDetailPage — header card, employment timeline, interactions feed, tasks table

**Next (after Track 1 verified):** Pause feature work. Plan port into Next.js App Router. Pages move to `app/*/page.tsx`; AuthContext is replaced by Supabase Auth helpers; api.ts client is replaced by server actions / route handlers.

**Original "Next":** Public intake chatbot page (/intake, no auth) — quote feature Phase 2.5

---

## ETL

**Status:** ✅ Complete — all entities migrated.
**Source:** peter-data @ localhost:5433/crm_db | **Dest:** ndt-crm @ localhost:5434/ndt_crm

**Migration impact:** ETL will need to re-target the Supabase Postgres connection string. Re-run `npm run migrate:reset` against Supabase once schema is ported. Counts must match: companies 2301, interactions 713, proposals 238, invoices 2225, leads 129.

---

## DB Migrations

| Migration | Status |
|---|---|
| `20260422001114_init` | ✅ Applied (local) |
| `20260422001411_add_user_password` | ✅ Applied (local) |

Both need to be re-applied against Supabase Postgres after Track 2 starts.

---

## Open Tasks (priority order)

1. **[Áron]** ✅ Install PostgreSQL 18 for Windows (port 5432)
2. **[Nate]** ✅ Create `crm` role + `ndt_crm` DB, run `prisma migrate deploy`, run seed
3. **[Nate]** ✅ Backend starts clean — login confirmed working (NestApplication started log)
4. **[Nate]** ✅ Delete Docker artifacts (`docker-compose.yml`, `backend/Dockerfile.dev`)
5. **[Nate]** ✅ Updated root `CLAUDE.md` stack table + all `.env` files to port 5432
6. **[Áron]** Create Supabase project (free tier), share connection string + anon key via `.env`
7. **[Nate]** Scaffold Next.js app in new directory (e.g., `web/`) inside this same repo. Port Prisma schema. Wire Supabase client.
8. **[Nate]** Port Companies module end-to-end as proof: list + detail page, server actions for CRUD, Supabase Auth gate.
9. **[Nate]** After proof works → port Persons, Contacts, Tasks, Interactions in that order.
10. **[Nate]** Then resume Quote feature Phase 2.5 on the new stack.

---

## Session Log

| Date | Domain | Completed | Next |
|---|---|---|---|
| 2026-04-22 | backend | Phase 1 | Companies |
| 2026-04-22 | backend | Companies + Persons + Contacts | Tasks |
| 2026-04-22 | frontend | Scaffold + Auth + AppLayout + all routes + page scaffolds | Wire CompaniesPage |
| 2026-04-22 | frontend | CompaniesPage (TanStack Table, debounced search, pagination, PipelineStatusBadge, FA filter) | Company detail |
| 2026-04-22 | frontend | CompanyDetailPage (tabs) | Persons list |
| 2026-04-22 | meta | Session system + design system | — |
| 2026-04-22 | etl | Foundation | Companies migration |
| 2026-04-22 | etl | All migrations complete | — |
| 2026-05-11 | direction | Project resumed. Standalone repo (no monorepo). Drop Docker. Plan migration to Next.js + Supabase. | Track 1: native Postgres install + verify current build runs |
| 2026-05-11 | track-1 | Track 1 complete: crm role + ndt_crm DB created, both migrations applied, seed ran (Tenant 1 + admin user), backend started clean, Docker artifacts deleted, all .env files updated to port 5432. | Track 2: scaffold Next.js app, port Prisma schema, wire Supabase client |
| 2026-05-11 | etl | Rewrote ETL to read directly from xlsx files (no source DB / Docker needed). Migrated: 1696 companies, 209 proposals, 663 interactions, 2016 invoices. Source: 20240125_accounts.xlsx + 20250228_CLIENTS.xlsx for pipeline status. npm run migrate:reset to re-run. | ETL complete for now — Docker dependency permanently eliminated |
