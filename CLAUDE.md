# NDT CRM — Master Context

## Project

Purpose-built CRM/ERP for the NDT (non-destructive testing) inspection industry.
First tenant: Controllabor Kft. (Hungary). Multi-tenant from day one — other NDT firms
can rent the same system. Owned by a separate entity (working name: Árpil), not Controllabor.
This separation means Controllabor can be sold with the CRM as an asset, increasing sale value.

**Current phase:** Scaffold + schema design. No UI built yet.

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

| Layer | Tech | Notes |
|---|---|---|
| Frontend | React 18 + Vite + TypeScript | SPA, no SSR needed |
| Backend | NestJS + TypeScript | Modular, structured, scales |
| ORM | Prisma | Schema as code, type-safe, migrations |
| Database | PostgreSQL 15 | |
| AI queries | Groq SDK (TypeScript) | llama-3.3-70b-versatile |
| Auth | Better Auth | Session-based |
| Mobile (later) | Expo (React Native) | Shared types with backend |
| Local dev | Docker Compose | |
| Deploy (later) | Railway/Render (backend+DB) + Vercel (frontend) | |

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

- `main` — stable, always deployable. No direct commits.
- `dev` — integration branch. Merge features here first.
- `feature/xxx` — one branch per feature
- `fix/xxx` — bug fixes
- `chore/xxx` — non-functional changes

**Commit format (Conventional Commits):**
```
feat(companies): add VAT number deduplication
fix(tasks): correct recurrence rule parsing
chore(deps): update prisma to 5.10
refactor(persons): extract contact merge logic to service
```

**PR flow:** feature → dev → (review) → main

---

## Key Decisions — Do Not Re-Debate

1. **TypeScript everywhere.** No Python. One language = one context = no switching.
2. **NestJS over Express/Hono.** This has real business logic. Modules + DI pay off.
3. **Prisma over raw SQL or other ORMs.** Type safety + migrations + great DX.
4. **SPA (React + Vite) over Next.js.** CRM is a fully authenticated app. No SEO needed. SSR adds complexity with no benefit here.
5. **Person-centric model.** Person = entity, Contact = state. Never collapse these.
6. **VAT number as company dedup key.** Names have spelling variants. VAT numbers don't.
7. **Interactions are append-only.** Never update, never delete. Full history preserved.
8. **Multi-tenant from day one.** `tenant_id` on every table. Controllabor is tenant 1.
9. **Tasks are atomic.** "Write email" and "Send email" are two tasks, not one.
10. **Timestamps on everything.** Every state change is recorded. Non-negotiable.

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
| NestJS bootstrap | ⬜ Not started |
| Auth | ⬜ Not started |
| Companies module | ⬜ Not started |
| Persons module | ⬜ Not started |
| Tasks module | ⬜ Not started |
| Frontend scaffold | ⬜ Not started |
| ETL rewrite (TS) | ⬜ Not started |
| Data migration | ⬜ Not started |

Update this table as work progresses.
