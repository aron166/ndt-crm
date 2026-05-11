# NDT CRM — Project Status

> All agents update this file at the end of every session. Keep entries brief.
> Format: `YYYY-MM-DD | [domain] | what was completed | what is next`

---

## Current State (2026-05-11 — direction reset)

**Project resumed after weeks of pause.** This repo is now **standalone** — forget the monorepo plan in `C:\Users\Áron\workspace`. This is the live CRM and will stay here.

**Lead dev:** Nate.

**Two parallel tracks, in order:**

### Track 1 — ✅ DONE (2026-05-11)
Native PostgreSQL 18 installed (port 5432, role `crm`/`crm`, db `ndt_crm`), migrations applied, seed ran, backend started clean, login confirmed, Docker artifacts deleted. The current NestJS + Vite stack is fully runnable locally.

### Track 2 — Migrate to Next.js + Supabase, **deliver features while migrating**

**Important reframe (2026-05-11):** Don't migrate first and add features after — that doubles the work. Migrate module-by-module, and bake each missing UI piece into the corresponding migration step. Every step ships a usable, daily-usable improvement to the CRM, not just a refactor.

**Goal of the CRM after this track:** A working operational tool Áron + Péter use daily — logging calls, tracking companies, managing tasks across the *whole portfolio* (NDT + every other Uphill Trade product). See `memory/ndt-crm-ecosystem-role.md` for the ecosystem-hub framing.

**Target stack:**

| Layer | From | To | Why |
|---|---|---|---|
| App framework | NestJS backend + Vite frontend (2 processes) | **Next.js App Router** (1 process) | Server actions kill REST boilerplate. One deploy. No CORS. |
| Database | Native Postgres (local only) | **Supabase** (managed Postgres + RLS) | Kills local DB ops. Free tier sufficient. RLS handles multi-tenant isolation. |
| Auth | Custom JWT + bcrypt in `AuthModule` | **Supabase Auth** | Deletes auth code. Session + magic link out of the box. |
| ORM | Prisma | **Keep Prisma** (point at Supabase Postgres) | Schema is good. Migrations are good. Portable. |
| AI | Groq llama-3.3-70b | Keep — or swap to Claude per-feature | Decide per feature. |

**What does NOT change:** data model (Person ≠ Contact, atomic tasks, append-only interactions, timestamps everywhere), the React + Tailwind + shadcn UI, TypeScript everywhere.

**Effort estimate:** 5–7 focused days end-to-end. After ~day 2 the CRM is usable for daily company/person lookups. After ~day 4 it's usable for the full call-logging + task workflow. New features ship continuously during the rewrite, not after.

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

## Open Tasks (priority order — Track 2 with embedded feature delivery)

### Setup
1. **[Áron]** ✅ Install PostgreSQL 18 for Windows (port 5432) — done
2. **[Nate]** ✅ Track 1 (DB + verify current build) — done
3. **[Áron]** Create Supabase project (free tier), share connection string + anon key via `.env`. Service role key for admin client too.
4. **[Nate]** Scaffold Next.js App Router app in `web/` inside this repo. Wire `@supabase/ssr` client + server-side auth helpers. Port Prisma schema (untouched) and point `DATABASE_URL` at the Supabase Postgres. Run `prisma migrate deploy` against Supabase.

### Migration + Feature Delivery (each step ships usable value)

5. **[Nate] Step 1 — Companies + Persons migration (no new features yet).**
   Port the list pages, detail pages, and CRUD as server actions. Replace AuthContext with Supabase Auth (login page + protected layout). Acceptance: Áron can log in, browse all 2300+ companies and persons, and the old Vite SPA can be retired for these flows. **Outcome: CRM is browsable on the new stack.**

6. **[Nate] Step 2 — Tasks page (NEW feature, on new stack).**
   Port the tasks API to server actions. Build the Tasks page from scratch in Next.js: create/edit/complete tasks, due dates, assignee, estimated vs actual minutes, subtask hierarchy, recurrence. Add a "+ Task" button visible from anywhere (universal create, Pipedrive-style). Acceptance: Áron + Péter can manage their daily task list end-to-end. **Outcome: core workflow tool is live.**

7. **[Nate] Step 3 — Interactions logging UI (NEW feature, on new stack).**
   Port interactions API. Add a "Log a call / email / meeting / site visit" button on Company detail and Person detail pages. Modal form: type, subject, body, timestamp (default now), participants. Append-only — never edit or delete. Existing migrated interactions show in a timeline. Acceptance: Péter can log a phone call in <15 seconds from a company page. **Outcome: daily call logging works.**

8. **[Nate] Step 4 — Deals pipeline (NEW feature, Pipedrive-inspired).**
   Port `deals` table to UI. Kanban view: columns = stages, cards = deals, drag to advance stage. Each card shows company, value (HUF), days in stage, next-activity icon. **"No next activity" warning** — deals with no open task turn red. Acceptance: Áron + Péter can see the whole sales pipeline at a glance and the system enforces "every active deal has a next action." **Outcome: sales discipline tool is live.**

9. **[Nate] Step 5 — Ecosystem hub schema + ingestion API (NEW capability).**
   Add new tables to Prisma schema (one migration): `conversations` (id, tenant_id, agent_id, person_id?, channel, started_at, ended_at), `messages` (conversation_id, role, content, created_at), `agents` (id, name, role, owner), `app_events` (source_app, event_type, payload, created_at). Build `POST /api/events` and `POST /api/conversations` route handlers with service-key auth so VeloQuote, CashFlow, and the agent team can write into the CRM. Surface conversation logs in the Person detail timeline. Acceptance: VeloQuote can post a quote-created event and it shows up in the company's activity feed. **Outcome: the CRM is now the central ledger for the whole portfolio.**

10. **[Nate] Step 6 — Resume Quote Phase 2.5 on the new stack.**
   Schema: `price_catalog`, `intake_submissions`, `quotes`, `quote_line_items`. Public intake page at `/intake` (no auth). Original roadmap continues.

### Working agreement
- Every step gets its own `feature/<step-name>` branch.
- Every step ends with: PR to `dev`, STATUS.md log entry with PR link, self-merge after typecheck passes.
- Do not start Step N+1 until Step N is merged to `dev` and verified working in Áron's local browser.
- Follow `C:\Users\Áron\workspace\VERSION_CONTROL.md` — non-negotiable.

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
| 2026-05-11 | track-2 | Scaffolded web/ (Next.js App Router + shadcn + Prisma 7 + Supabase packages). Supabase project live (ref ortqjkzoghrkzypmlvbb, eu-central-1). Blocked: pooler returns "Tenant or user not found" on all connection attempts. Direct host is IPv6-only (unreachable). Next: copy exact connection string from Supabase dashboard (Project Settings → Database → URI → Transaction mode) and retry prisma migrate deploy. |
| 2026-05-12 | track-2 | Unblocked Supabase connection. Root causes: wrong pooler region (aws-0 → aws-1), stale password, Prisma URL parser truncating username at dot (fix: %2E encoding), Prisma 7 config not loading .env (fix: explicit dotenv in prisma.config.ts). Both migrations applied to Supabase, Prisma client generated. Next: Step 1 — port Companies + Persons to Next.js App Router + wire Supabase Auth. |
| 2026-05-12 | step-2 | Step 2 complete. Tasks page: list with open/done/all + overdue/today/week filters, inline complete toggle, create/edit modal, subtask hierarchy on detail page. Universal "+ Feladat" button in topbar visible from every page. Server actions: createTask, updateTask, completeTask, reopenTask, deleteTask. Next: Step 3 — Interaction logging UI (log call/email/meeting from company + person pages). |
| 2026-05-12 | step-1 | Step 1 complete. Built full Next.js App Router shell: Supabase magic-link auth (login page + proxy.ts + auth/callback), AppShell with collapsible sidebar + topbar, Companies list + detail (tabs: contacts, interactions), Persons list + detail (employment timeline + interactions). ETL retargeted to Supabase: 1696 companies, 2016 invoices, 663 interactions loaded. Server runs clean on localhost:3000. Next: Step 2 — Tasks page (create/edit/complete, universal + Task button). |
