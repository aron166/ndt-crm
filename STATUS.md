# NDT CRM — Project Status

> All agents update this file at the end of every session. Keep entries brief.
> Format: `YYYY-MM-DD | [domain] | what was completed | what is next`

---

## 🔴 Read First — CRM Logic Briefing (2026-05-12)

Kai posted `BRIEFING_2026-05-12.md` at the repo root. **Read it before starting Step 4** (Deals kanban). It:
- Names four concepts the current plan under-reflects: person permanence + employment as a state, microtask attributes (executor + cost + revenue + skill), the precondition engine, NDT cost codes (KID / MRD / DOD / SZD / VIZSGALAT)
- **Rewrites Step 4 entirely** — fully customizable pipelines with user-defined stages, custom fields, saved views, weighted forecast, stale-deal warnings, bulk actions, multi-pipeline views
- Adds two future steps (4.5 — Skill/Equipment Precondition Engine; 4.7 — NDT Cost Codes + Field Time Tracking). Don't build them yet; don't block them schema-wise.

**Step 2 schema addendum (since Step 2 shipped 2026-05-12 before this briefing landed):**
Add a small follow-up migration before Step 4 starts that introduces the columns the briefing names on `tasks`: `category` enum (revenue_generating | non_revenue), `executor_type` enum (human | ai_agent | robot, default human), `skill_required_id` (nullable FK, target table added later in Step 4.5), `cost_code` enum (KID | MRD | DOD | SZD | VIZSGALAT, nullable), `set_membership` (text array or junction table — Péter's "halmazok"), and either rename the existing status enum values or add a mapping to Péter's vocabulary (`created → in_progress → done`). No UI needed yet — the goal is to avoid a second migration churn when 4.5/4.7 land. Land this as `feature/step-2-schema-addendum`.

**Decisions resolved by Áron (2026-05-12):**
- **NDT Brokerage is a separate product, not a pipeline here.** Don't model it. Don't reserve schema for it.
- **Custom field storage: JSONB on the deal row** with `pipeline_custom_fields` definition table + GIN index on `deals.custom_fields`. Same pattern when person/company custom fields land.
- **Geolocation in scope** for Step 4.7 + the CRM needs an integrations layer (Google Maps first; Calendar, Twilio, Resend, NAV/SZAMLAZZ likely to follow). Build the pattern in 4.7 so other integrations slot in without core changes. Full spec in `BRIEFING_2026-05-12.md` under "NEW — Step 4.7 expanded".

**Step 3 enhancement (in progress):**
Confirm that the Person model supports proper time-bounded employment (`person_id, company_id, role, valid_from, valid_to` with `valid_to` nullable and multiple historical rows allowed) and versioned contact data per employment (email/phone/title with their own validity intervals). The current "employment timeline" UI from Step 1 implies the schema is partway there — verify a 2023 conversation thread can still resolve to the 2023 email address. If the schema doesn't support that, raise it before Step 3 ships.

---

<<<<<<< HEAD
## Backlog — Péter Meeting 2026-05-14 (ACTIVE)

**Direction:** Stop settings work. Each item below gets its own branch from `dev`. Merge order: schema → CRUD → list filters → import. Áron approves each PR before push to prod.

### Branch 1: `feature/company-data-model` ✅ COMMITTED (2026-05-14)
30 new Company fields from xlsx: warmth, TEÁOR, scopeOfActivity, NDT capability matrix, telephely, revenue 2019-2024, competitors, etc.
ETL: `npm run enrich` in etl/ — 1698 companies updated from MAIN sheet.
UI: warmth badge + TEÁOR in header, "Cég adatok" right panel, "NDT Profil" tab.
**FOLLOW-UP REQUIRED (separate branch `feature/ndt-profile-edit`):**
- Auto-update logic: when enrichment engine runs on a company, it should propose updates to all new fields (scopeOfActivity, TEÁOR, ndtMethods, etc.) — wire into enrichment proposal UI
- Manual edit UI for each field in the NDT Profil tab (inline edit or drawer) — user can override any enriched value per company

### Branch 1 (original spec)
Schema additions to Company (all sourced from `etl/data/20240125_accounts.xlsx` MAIN sheet):
- `warmth` — cold / warm / hot (Account Temperature, xlsx col 29)
- `teaorCode` — full 4-digit TEÁOR e.g. "2511" (col 52, replaces sector-only `industryCode`)
- `teaorDescription` — Hungarian industry description e.g. "Fémszerkezet gyártása" (col 53)
- `industryEn` — English industry name (col 57)
- `scopeOfActivity` — what they actually do (col 60); prime target for enrichment agent
- `euVatNumber` — EU-format VAT number (col 7)
- `linkedinUrl` — company LinkedIn (col 49)
- `leadSource` — how they first contacted Controllabor (col 15)
- `ndtMethods` String[] — VT/PT/MT/UT/RT/DRT/LT/HT/SPECTRO/consultation (cols 93-103)
- `productAreas` String[] — w/wp/f/c/t/p = welding/fabrication/casting/pressure (cols 63-69)
- `materials` String[] — Fe/Al/Cu/AM inspected materials (cols 73-78)
- `products` String[] — GYÁRTMÁNY_01-07, what the company manufactures (cols 80-86)
- `isPedCompliant` Boolean? — Pressure Equipment Directive flag (col 87)
- `inspectionFrequency` — "rendszeresen" / "évente néhány alkalom" etc. (col 104)
- `hasInternalLab` Boolean? — whether they have in-house testing capability (col 105)
- `competitor1/2/3` String? — NDT competitors they currently use (cols 106-108)
- `siteZip/siteCity/siteStreet/siteCounty/siteCountry` — TELEPHELY operating address (cols 117-121)
- `revenue2019..2024` BigInt? — yearly revenue summary (cols 31-36)
- `customerValue` BigInt? — ÜGYFÉLÉRTÉK total (col 37)

ETL: re-run to populate all new fields from xlsx after migration.
UI: Company detail — new "NDT Profil" tab (capabilities matrix, material types, products, competitors, frequency, lab type). Address section shows both SZÉKHELY + TELEPHELY.

### Branch 2: `feature/crud-improvements`
- Create new company (modal + server action)
- Create new person (modal + server action)
- Edit company / person inline on detail pages
- Delete company / person (soft delete + confirmation dialog)
- Date picker when ending a Contact — input the ACTUAL leave date, not auto-"now"
- Person detail: literal "Naplózás" + "Feladat" quick-action buttons above the tabs (not buried)

### Branch 3: `feature/list-enhancements`
- Company list: badge/dot if company has at least one active contact (person linked)
- Company list filters: warmth, accountType/partnerCategory, TEÁOR sector, city, county, NDT method
- Person list filters: role, current company, tag, has-no-contact
- Pipeline stage reordering: drag handles in pipeline settings

### Branch 4: `feature/accounts-import`
Depends on Branch 1 (new schema columns must exist first).
- Import accounts xlsx: map warmth + partnerCategory + all NDT profile fields → existing companies by VAT
- Show preview diff (current vs proposed) before applying
- Log as an EtlRun entry

---

## Backlog — Ongoing (2026-05-13, lower priority)

1. **Complete task → log interaction in one step** — when completing a call/meeting/email task, pop a quick modal to log what happened simultaneously. Only triggers for interaction-type tasks (call, email, meeting, site visit).
2. **Gmail sync** — connect Gmail via OAuth, auto-log sent/received emails as interactions. Note: `etl/data/20240125_accounts.xlsx` Munka1 sheet has 3891 historical email records for bootstrap.
3. **Google Calendar sync** — meetings show up as interactions, tasks can generate calendar events.
4. **Automations** — rule engine: "when deal sits in stage X for N days → create follow-up task".
5. **NDT cost codes UI** — KID/MRD/DOD/SZD/VIZSGALAT dropdown on task form (`cost_code` column already in schema).
6. **Quote intake page** (`/intake`) — public, no auth, client submits quote request → feeds into pipeline.
7. **Google Maps distance calc** — KID travel cost auto-fill from geocoded address to Controllabor office.
8. **Campaign feature** — bulk-select companies by complex filter (warmth + NDT method + industry + frequency) → push to campaign. Schema reserved via tags for now.
9. **AI scope-of-activity scrape** — agent fetches company website, fills `scopeOfActivity` via enrichment engine. Both `website` field + enrichment engine already exist.
10. **Incoming call auto-log** (dream) — Péter's phone integration. Flag for Step 6 integrations layer.
11. **Google Contacts sync** — dedup on email. Assess after Gmail sync lands.

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

7.7. **[Nate] Step 3.7 — Redesign pass to Árpil mockup (NEW 2026-05-12).**
   Áron shipped a full coded mockup at `ndt-crm/redesign/` (shell + dashboard + companies + persons + tasks + ui primitives + 781-line styles.css + goal screenshots). Previous translation landed tokens but lost the bespoke industrial look — see `ndt-crm/redesign/REDESIGN_BRIEF.md` for the diagnosis and the four-phase fix. **Phases (one PR each):** (1) port `styles.css` lines 80–781 into `globals.css` under `@layer components`; (2) rebuild shell (Sidebar/Topbar/StatusBar) to match `shell.jsx` exactly; (3) build viz components (Sparkline / AreaChart / BarChart / Donut / StackBar / Oscilloscope / LiveClock) from `ui.jsx`; (4) page-by-page port (dashboard → tasks → companies → persons), each PR with a screenshot diff against `goal.png` / `goal1.png`. Runs in parallel with Step 3 to the extent files don't conflict. Don't refactor the mockup CSS into Tailwind utility chains. Don't introduce a chart library. Honor the mockup as source of truth.

7.5. **[Nate] Step 3.5 — Cross-entity tags (NEW 2026-05-12).**
   `tags` table (id, tenant_id, name, color) + polymorphic `taggings` join (tag_id, taggable_type, taggable_id) covering company / person / deal / task / interaction. Tag chip UI, autocomplete-create, tag-filter on every list page. Acceptance: one tag applied to a company + deal + task surfaces all three in one tag query. Full spec in `BRIEFING_2026-05-12.md` "Immediate additions".

7.6. **[Nate] Step 3.6 — Audit log (NEW 2026-05-12).**
   `audit_log` table + Postgres triggers on every business table (companies, persons, deals, tasks, interactions, employments, taggings, custom_fields) writing before/after JSONB diff. Resolves actor from Supabase Auth (user) or service-key path (agent). "History" tab on every detail page. Acceptance: any field change on any entity shows up in the audit log with who/when/before/after.

8. **[Nate] Step 4 — Fully Customizable Pipelines + shared Kanban (EXTENDED 2026-05-12).**
   See full brief in `BRIEFING_2026-05-12.md`. Summary: user-defined pipelines (N per tenant), user-defined stages per pipeline (name, color, probability %, optional WIP limit), user-defined custom fields per pipeline (text / number / date / single-select / multi-select / person / company), drag-drop kanban with optimistic update + activity-log entry on every move, **weighted forecast** (Σ deal_value × stage.probability), **saved views** (per user, filter + sort + column visibility, shareable Y/N), **stale-deal red flag** (any non-terminal deal with no open task linked), **universal "+ Deal" quick-create** mirroring "+ Task", **bulk actions** (move N deals, change owner, archive), **multi-pipeline cross-view** ("all my deals over 5M HUF this quarter, any pipeline").
   **Kanban primitive is reusable.** Build it once; instantiate twice: (a) Deals view with user-defined stages per pipeline, (b) Tasks view with status columns (`created → in_progress → done`), filterable by category / executor_type. Tasks page keeps list as default; kanban is a toggle. Both views support the tag filter from Step 3.5.
   Acceptance: Áron creates a second pipeline ("BirdsView Pilots") with its own stages and custom fields with no code change; drag-drop, weighted forecast, saved views, stale flag, tasks-kanban toggle all work; audit log records every move. **Outcome: a real CRM, not a generic kanban clone.**

8.6. **[Nate] Step 4.6 — Global search Cmd+K / Ctrl+K (NEW 2026-05-12).**
   Enable `pg_trgm` on Supabase + GIN trigram indexes on company.name, person.name+email, deal.title, task.title, interaction subject+body, tags.name. Server action `globalSearch(query, limit)` returns grouped result with similarity scores. UI: Cmd+K overlay, type-ahead, grouped + collapsible results, keyboard navigation. Scoped variants from detail pages ("search in this company"). Acceptance: typing "MÁV" returns matched companies / persons / deals / tasks / interactions / tags in <200ms on the existing dataset. Full spec in briefing.

8.8. **[Nate] Step 4.8 — Analytics / KPI page (PROMOTED 2026-05-12, was Step 5.5).**
   Lives at `/analytics`. v1 cards: pipeline velocity (avg days/stage from audit log), stage conversion rate, deal age distribution, weighted-forecast trendline, task completion (on-time vs overdue), interaction frequency. Time range selector (7d / 30d / 90d / quarter / YTD). Filter by tag / pipeline / owner / custom field. Click any card → drill-down list (reuses saved views from Step 4). v2 cards plug in once ecosystem-hub events (Step 5) start flowing. Acceptance: Áron opens /analytics, sees 6 live cards filled from real CRM data, drills into one and lands on the contributing records.

9. **[Nate] Step 5 — Ecosystem hub schema + ingestion API (NEW capability).**
   Add new tables to Prisma schema (one migration): `conversations` (id, tenant_id, agent_id, person_id?, channel, started_at, ended_at), `messages` (conversation_id, role, content, created_at), `agents` (id, name, role, owner), `app_events` (source_app, event_type, payload, created_at). Build `POST /api/events` and `POST /api/conversations` route handlers with service-key auth so VeloQuote, CashFlow, and the agent team can write into the CRM. Surface conversation logs in the Person detail timeline. Acceptance: VeloQuote can post a quote-created event and it shows up in the company's activity feed. **Outcome: the CRM is now the central ledger for the whole portfolio.**

9.5. **[Nate] Step 6 — Cost codes + Integrations layer + Google Maps + Geolocation (MOVED LATER 2026-05-12, was Step 4.7).**
   Áron explicitly deferred this behind Analytics + Ecosystem Hub. Spec unchanged — see `BRIEFING_2026-05-12.md` "Step 6" section. NDT cost codes (KID / MRD / DOD / SZD / VIZSGALAT), integration pattern (`integrations` + `integration_credentials` + `/lib/integrations/<slug>.ts`), Google Maps as first integration (geocode, distance, withinRadius, map widget), per-call logging + budget caps, geolocation 100m field-visit trigger.

10. **[Nate] Step 7 — Resume Quote Phase 2.5 on the new stack.**
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
| 2026-05-12 | session-end | Full session complete. 51 tests passing. All features merged to dev. ETL: 1632 persons from Google Contacts xlsx. Dark redesign from redesign/ reference (styles.css ported, viz components built). Skills: next-best-practices + anti-slop + design-taste installed. Bugs fixed: RSC-in-client loops (tags, audit), sidebar toggle overflow, no-scroll, kanban card links, hydration mismatch (useId), GROUP BY alias, kpi-grid missing. Next session: Step 4 enhancements → analytics drill-through → Step 5 ecosystem hub. |
| 2026-05-12 | step-4-8 | Analytics dashboard live at /analytics. KPI strip (companies/persons/revenue/interactions), revenue trajectory 2010-2023 area chart, pipeline coverage StackBar, top 10 companies by revenue, cold companies list (90+ days no contact). All numbers real DB data, no mock. Fixed: GROUP BY alias SQL error, useId() hydration fix, kpi-grid CSS missing (inline style fallback). |
| 2026-05-12 | step-4-6 | Cmd+K global search. pg_trgm enabled + GIN indexes on 5 tables. Grouped overlay (companies/persons/deals/tasks/tags), keyboard nav, 150ms debounce. Click topbar or press Ctrl+K. |
| 2026-05-12 | step-4 | Step 4 complete (MVP). Pipelines + stages schema, Deal model with pipelineId/stageId/personId/position/customFields(JSONB). Default NDT Sales pipeline seeded (5 stages). Deals kanban with drag-drop, stale-deal warning (red border if no open task), weighted forecast in header, per-column value totals. Deal create/edit modal with company/person search. Pipeline setup page (create stages, colors, probability%). Universal Feladat/Deal split button in topbar. serializeDates now handles Prisma Decimal. Deferred: saved views, multi-pipeline cross-view, bulk actions, custom fields UI. Next: Step 4.6 (Cmd+K global search) then Step 4.8 (analytics). |
| 2026-05-12 | step-2 | Step 2 complete. Tasks page: list with open/done/all + overdue/today/week filters, inline complete toggle, create/edit modal, subtask hierarchy on detail page. Universal "+ Feladat" button in topbar visible from every page. Server actions: createTask, updateTask, completeTask, reopenTask, deleteTask. Next: Step 3 — Interaction logging UI (log call/email/meeting from company + person pages). |
| 2026-05-13 | missing-pages | Dashboard (today's tasks + cold companies + interactions + pipeline bar), /invoices (year tabs, search, pagination), /settings (general + integrations tab with Google Maps live connect + 5 coming-soon cards). IntegrationCredential schema. PR #6 merged. |
| 2026-05-13 | saved-views | Helm CRM rename (4 spots). SavedView table + createSavedView/deleteSavedView/getSavedViews. SavedViewsDropdown component wired to companies + persons pages. PR #5 merged. |
| 2026-05-13 | ux-polish | Borderless tables, relative time, 4-col companies list, role+phone in persons, tasks page dark-theme fix. PR #4 merged. |
| 2026-05-13 | perf | loading.tsx for 8 routes, pulse animation, pool idleTimeout 30s. PR #3 merged. |
| 2026-05-13 | step-5-ecosystem-hub | Ecosystem hub complete. New tables: agents/conversations/messages/app_events. Migration applied + recorded. POST /api/events + POST /api/conversations with service-key auth. Person detail: AI Conversations tab. Company detail: Events tab. 51 tests green. PR #2 merged to dev. Next: Step 4 enhancements (saved views, custom fields UI, bulk actions) OR Step 6 integrations layer. |
| 2026-05-13 | analytics-drillthrough | Analytics drill-through complete. Revenue KPI card + year labels → /analytics/invoices (new page: year tabs, company search, 200-row table). 'Soha nem kontaktált' count → /companies?never_contacted=1. Companies page handles never_contacted + pipeline_status query params with dismissable banner. CompaniesSearch preserves drill-through params. Explorer tab links wired. 51 tests green. PR #1 merged to dev. Next: Step 5 — ecosystem hub schema + ingestion API. |
| 2026-05-13 | vercel-deploy-prep | Build passes clean (0 TS errors, 20 routes). Fixed: tsconfig.json excluded prisma/ dir so seed.ts (bcrypt) does not break Next.js type-check. Committed missing web/ config files. PR #8 open. Áron: follow Vercel manual checklist (env vars, root dir, Supabase redirect URL). Next: bulk kanban actions + Google Maps distance calc + NDT cost codes UI. |
| 2026-05-13 | enrichment-engine | Enrichment engine complete. EnrichmentRun + EnrichmentProposal tables migrated (manual SQL, bypassing drift from pg_trgm indexes). groq-sdk installed. enrichment.ts server action: enrichCompany (Hungarian registry check + Groq llama-3.3-70b-versatile), enrichPerson (LinkedIn URL + notes inference), triggerBulkEnrichment (sequential, capped at 20), applyProposal (field-level approve/reject, audit log, entity write-back). /enrichment page: Queue tab (pending proposals with per-field approve/reject checkboxes, confidence bars, source badges) + Runs tab (status table). RunEnrichmentButton on companies list page. Sidebar entry under ÜZEMELTETÉS. 0 TS errors, 51 tests green, build clean (22 routes). PR open — awaiting Áron review. | Merge to dev after review |
| 2026-05-12 | step-1 | Step 1 complete. Built full Next.js App Router shell: Supabase magic-link auth (login page + proxy.ts + auth/callback), AppShell with collapsible sidebar + topbar, Companies list + detail (tabs: contacts, interactions), Persons list + detail (employment timeline + interactions). ETL retargeted to Supabase: 1696 companies, 2016 invoices, 663 interactions loaded. Server runs clean on localhost:3000. Next: Step 2 — Tasks page (create/edit/complete, universal + Task button). |
