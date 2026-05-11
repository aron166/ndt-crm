# NDT CRM — Master Context

## Project

Purpose-built CRM/ERP for the NDT (non-destructive testing) inspection industry.
First tenant: Controllabor Kft. (Hungary). Multi-tenant from day one — other NDT firms
can rent the same system. Owned by a separate entity (working name: Árpil), not Controllabor.
This separation means Controllabor can be sold with the CRM as an asset, increasing sale value.

**Current phase (2026-05-11):** Backend + frontend feature work is functionally complete for companies/persons/contacts/tasks/interactions. Project paused, now resumed standalone (no monorepo). **Active direction change — read STATUS.md before doing anything else.**

Headline:
1. Docker is being dropped. Use native PostgreSQL locally. Docker Desktop is broken on this machine and won't be fixed.
2. Stack is migrating to **Next.js App Router + Supabase**. NestJS / Vite / custom JWT auth will be retired. Prisma + the data model + the React UI stay.
3. Track 1 (run current build natively) is blocking. Track 2 (migrate stack) starts after Track 1 verifies.

See for more context: ProjectOverview.md and STATUS.md

---


## Business Context

- Company: Controllabor Kft., Hungarian NDT inspection company
- Partners: Péter (domain expert, owner) + Áron (developer)
- Language: Hungarian business context, Hungarian column names in source data
- Currency: HUF (Hungarian Forint) unless otherwise noted
- Status codes used throughout: 0=KUKA(dead), 1=NEM HÍVTUK, 2=HÍVTUK NO ANSWER,
  3=HÍVTUK INTERESTED, 4=HÍVTUK NOT INTERESTED, 5=HÍVTUK WANTS IT,
  6=PENDING, 7=CL (Closed Lost), 8=CW (Closed Won)
- F.A. = Felszámolás Alatt (under liquidation) — exclude from most queries
- Historical data: ~2,255 companies, 2,225 invoices, 713 interactions, 266 proposals,
  118 leads migrated from Zoho CRM xlsx exports (stored in peter-data repo)

---

## Stack

**Current (what exists in this repo right now):**

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | SPA, no SSR |
| Backend | NestJS + TypeScript | Modular, DI |
| ORM | Prisma | Schema as code, type-safe |
| Database | PostgreSQL 18 (native install, NOT Docker) | Port 5432 — role: crm/crm, db: ndt_crm |
| AI queries | Groq SDK | llama-3.3-70b-versatile |
| Auth | Custom JWT + bcrypt in `AuthModule` | To be retired |
| Local dev | `npm run start:dev` (backend) + `npm run dev` (frontend) | Docker removed |

**Target (Track 2 migration, see STATUS.md):**

| Layer | Tech | Notes |
|---|---|---|
| App framework | **Next.js App Router** | Replaces Nest + Vite split. One process, one deploy. |
| Database | **Supabase** (managed Postgres + RLS) | No more local DB ops. RLS handles multi-tenant isolation. |
| ORM | Prisma (kept) | Schema portable, point at Supabase connection string |
| Auth | **Supabase Auth** | Replaces custom JWT/bcrypt |
| AI | Groq or Claude (per feature) | Decide per feature |
| Mobile (later) | Expo | Shares Supabase client + types |
| Deploy | Vercel (Next.js) + Supabase (DB/auth) | |

**One language everywhere: TypeScript.** No Python. ETL is TypeScript scripts.

**One language everywhere: TypeScript.** No Python. ETL is TypeScript scripts.

---

## Architecture

```
ndt-crm/
├── frontend/          React + Vite SPA
│   └── src/
│       ├── components/
│       ├── pages/
│       ├── hooks/
│       ├── lib/       api client, utils
│       └── types/     frontend-specific types
├── backend/           NestJS application
│   ├── src/
│   │   ├── modules/   one folder per domain
│   │   │   ├── companies/
│   │   │   ├── persons/
│   │   │   ├── contacts/
│   │   │   ├── tasks/
│   │   │   ├── deals/
│   │   │   ├── leads/
│   │   │   ├── invoices/
│   │   │   ├── interactions/
│   │   │   ├── equipment/
│   │   │   └── ai/
│   │   ├── common/    guards, filters, pipes, decorators
│   │   └── main.ts
│   └── prisma/
│       ├── schema.prisma   ← SOURCE OF TRUTH for data model
│       └── migrations/
├── etl/               TypeScript scripts for xlsx → postgres migration
│   └── src/
│       ├── load.ts
│       └── sheet-map.ts
├── shared/
│   └── types/         types shared between frontend + backend
├── ADR/               Architecture Decision Records
├── docker-compose.yml
├── .env.example
└── CLAUDE.md          ← this file
```

Each NestJS module follows this structure:
```
modules/companies/
├── companies.module.ts
├── companies.controller.ts   HTTP layer only, no business logic
├── companies.service.ts      all business logic here
├── companies.repository.ts   all Prisma queries here
├── dto/
│   ├── create-company.dto.ts
│   └── update-company.dto.ts
└── entities/
    └── company.entity.ts
```

---

## Core Data Model

### The Key Insight: Person ≠ Contact

**Person** = a human being. Entity. Persists regardless of employer.
**Contact** = a relationship state. Person at a Company, bound to a time interval.
**Company** = an organization. Entity.

When Kovács Béla moves from Company A to Company B:
- His Person record stays. Communication history, relationship quality, context = preserved.
- A new Contact record is created for Company B. The old one gets `ended_at` set.
- This is how LinkedIn works. No other CRM in the NDT market does this.

```
Person (1) ──── (many) Contact (many) ──── (1) Company
                        │
                   [role, email, phone, started_at, ended_at]
```

### Schema Overview

| Table | Purpose |
|---|---|
| `tenants` | Multi-tenancy root |
| `persons` | Human beings — persists across employers |
| `companies` | Organizations — deduplicated on vat_number |
| `contacts` | Person ↔ Company relationship (time-bound state) |
| `users` | Controllabor staff using the system |
| `leads` | Inbound opportunities |
| `deals` | Sales pipeline stages |
| `proposals` | Offer documents sent |
| `invoices` | Revenue records (HUF, back to 2010) |
| `tasks` | Atomic work units — everything is a task |
| `interactions` | Append-only communication log |
| `equipment` | NDT instruments (serial numbers, calibration) |
| `etl_runs` | Data load audit log |

Full schema: `backend/prisma/schema.prisma`

### Tasks — The Heart of the System

Everything in the system is a task. Tasks are extremely granular:
- "Write email" and "Send email" = two separate tasks
- "Prepare completion certificate" and "Get it signed" = two separate tasks

Task fields that matter:
- `estimated_minutes` (normaidő) — standard time estimate, measured against actual
- `category` — `revenue` | `cost` | `internal` | `external`
- `notify_before` — days before due date to notify
- `parent_task_id` — subtask hierarchy
- `is_recurring` + `recurrence_rule` (RRULE)
- Full timestamp audit: `created_at`, `updated_at`, `completed_at`

**Timestamps on everything. This is non-negotiable.**

---

## Naming Conventions

### Database (Prisma)
- Table names: `snake_case` plural (`companies`, `etl_runs`)
- Column names: `snake_case` (`vat_number`, `created_at`)
- Prisma model names: `PascalCase` singular (`Company`, `EtlRun`)
- Prisma field names: `camelCase` (`vatNumber`, `createdAt`)
- Always use `@map` to keep DB columns in snake_case

### TypeScript
- Files: `kebab-case` (`company.service.ts`, `create-company.dto.ts`)
- Classes: `PascalCase` (`CompanyService`, `CreateCompanyDto`)
- Functions/variables: `camelCase`
- Constants: `SCREAMING_SNAKE_CASE`
- Types/Interfaces: `PascalCase`, prefix interfaces with `I` only if needed to avoid collision

### API Routes
- REST, plural nouns: `/companies`, `/persons`, `/tasks`
- Nested: `/companies/:id/contacts`, `/deals/:id/tasks`
- Query params for filtering: `/companies?status=active&city=Budapest`
- All responses: `{ data: T, meta?: PaginationMeta }`

---

## API Design Rules

1. Controllers handle HTTP only — no business logic, no Prisma calls
2. Services contain all business logic — call repository methods
3. Repositories contain all Prisma queries — never call Prisma from service directly
4. DTOs validate all input (class-validator decorators)
5. Never expose internal IDs in URLs unless necessary — use them internally
6. Pagination on all list endpoints: `{ data: [], meta: { total, page, pageSize } }`
7. Soft deletes where data has historical value (interactions, deals)
8. Hard deletes only for truly transient data

---

## Git Workflow

Follow `C:\Users\Áron\workspace\VERSION_CONTROL.md` — the single source of truth across all repos. Summary:

- `main` stable, `dev` integration, work happens on `feature/`/`fix/`/`chore/` branches.
- Conventional Commits (`feat(scope): ...`). Commit at every logical step, not just session end.
- Every session ends with: pushed branch + open PR (`gh pr create --base dev`) + STATUS.md log entry with PR link.
- Self-merge to `dev` after CI green. `dev` → `main` requires Áron's review.
- Never commit `.env`. Never commit to `main` or `dev` directly.

---

## Key Decisions — Do Not Re-Debate

**Data & domain (permanent):**
1. **TypeScript everywhere.** No Python. One language = one context.
2. **Prisma over raw SQL or other ORMs.** Type safety + migrations + great DX. Survives the stack migration.
3. **Person-centric model.** Person = entity, Contact = state. Never collapse these.
4. **VAT number as company dedup key.** Names have spelling variants. VAT numbers don't.
5. **Interactions are append-only.** Never update, never delete. Full history preserved.
6. **Multi-tenant from day one.** Every table is tenant-scoped. Controllabor is tenant 1. (Will be enforced via Supabase RLS post-migration instead of `tenant_id` filters in code.)
7. **Tasks are atomic.** "Write email" and "Send email" are two tasks, not one.
8. **Timestamps on everything.** Every state change is recorded. Non-negotiable.

**Stack (revised 2026-05-11 — were previously locked, now retired):**
9. ~~NestJS over Express/Hono.~~ → Migrating to Next.js App Router. Rationale: standalone solo project, no monorepo, one-process deploy beats DI ergonomics here.
10. ~~SPA (React + Vite) over Next.js.~~ → Migrating to Next.js. The "no SEO needed" argument still holds; the win is killing the backend/frontend split and getting server actions.
11. ~~Custom auth (Better Auth / JWT).~~ → Supabase Auth. Rationale: deletes a lot of auth code; sessions + magic links out of the box.
12. ~~Docker Compose for local dev.~~ → Native Postgres locally, Supabase remotely. Rationale: Docker Desktop is unreliable on this machine and the indirection has no payoff for a solo dev.

The React frontend code, Tailwind, shadcn/ui, design tokens, and Prisma schema all carry over to the new stack. The data model does not change.

---

## What NOT to Do

- Never put business logic in controllers
- Never call Prisma directly from a controller or service — use repositories
- Never skip the `tenant_id` filter on any query — data isolation is critical
- Never use `any` in TypeScript — if you need it, define the type
- Never update an interaction record — append a new one
- Never collapse Person and Contact into one table
- Never skip DTO validation on user input
- Never commit `.env` files
- Never merge directly to `main`

---

## Status

| Area | Status |
|---|---|
| Project scaffold | ✅ Done |
| Prisma schema | ✅ Done |
| Docker setup | ✅ Done |
| NestJS bootstrap | ✅ Done |
| Auth | ✅ Done |
| Companies module | ✅ Done |
| Persons module | ✅ Done |
| Tasks module | ⬜ Not started |
| Frontend scaffold | ⬜ Not started |
| ETL rewrite (TS) | ⬜ Not started |
| Data migration | ⬜ Not started |

Update this table as work progresses.
