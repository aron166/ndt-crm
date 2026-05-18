# Helm CRM

A purpose-built CRM for the **NDT (non-destructive testing) industry** — designed around the operational realities of inspection companies rather than the generic "lead → deal → won" funnel that off-the-shelf CRMs ship with.

The product treats data integrity as a first-class concern: people, companies, contacts, and interactions are modeled separately and immutably, so the history of a relationship can be reconstructed at any point in time.

---

## Stack

- **Next.js 16** (App Router, React 19, Server Actions)
- **TypeScript** end-to-end
- **Supabase** — Postgres, Auth, Row-Level Security
- **Prisma 7** with the `pg` adapter (direct pooled connections, no PgBouncer prepared-statement issues)
- **Tailwind CSS 4** + **shadcn/ui** + **Base UI** for the design system
- **Vitest** for unit + component tests
- **Vercel** for hosting

---

## Architecture highlights

### 1. Person ≠ Contact

In most CRMs, a contact *is* a person. Here, they are two different things:

- **`Person`** — the permanent entity. A human being. Stable across job changes.
- **`Contact`** — a time-bounded link between a Person and a Company. When someone changes employer, the Person stays; a new Contact is created.

This means the system can answer "who used to work at X?" and "where does Y work now?" without losing history.

### 2. Append-only interactions

Every email, call, meeting, or note is written once and never mutated or deleted. The interaction log is an immutable event stream — the source of truth for what actually happened, independent of any later edits to the entities involved.

### 3. Atomic tasks

"Write the proposal" and "send the proposal" are two distinct tasks. Tasks describe one observable action, which makes status reporting, automation, and AI agent handoffs deterministic.

### 4. Multi-tenant by default

Every query is scoped to `tenant_id`. Isolation is enforced at the database layer via Supabase **Row-Level Security** policies — application bugs cannot cross tenants because the database refuses the read.

### 5. Domain-specific data model

The schema encodes NDT industry reality: capability matrices (UT, RT, MT, PT, VT, ET, etc.), TEÁOR (Hungarian industry classification) codes, equipment inventories, competitor tracking, and warmth scoring — none of which exist in a generic CRM.

---

## Project structure

```
ndt-crm/
├── web/                      # Next.js application
│   ├── prisma/
│   │   ├── schema.prisma     # 25+ models: Tenant, Person, Company, Contact,
│   │   │                     #   Deal, Pipeline, Task, Interaction, Invoice,
│   │   │                     #   Agent, Conversation, EnrichmentRun, AuditLog…
│   │   └── migrations/
│   └── src/
│       ├── app/
│       │   ├── (app)/        # Authenticated routes: companies, persons,
│       │   │                 #   deals, tasks, invoices, analytics,
│       │   │                 #   enrichment, settings
│       │   ├── actions/      # Server actions (mutations)
│       │   ├── api/          # Route handlers (webhooks, integrations)
│       │   └── auth/         # Supabase auth flows
│       ├── components/       # UI primitives + feature components
│       └── lib/              # db, audit, interactions, supabase, integrations
├── etl/                      # Data import pipelines (legacy XLSX → Postgres)
├── shared/                   # Cross-package types and contracts
└── ADR/                      # Architecture Decision Records
```

---

## Notable features

- **Inline editing** on detail pages — click a field, edit, blur to save, with optimistic UI and audit logging.
- **AI enrichment pipeline** — proposes data updates (website, industry codes, contact info) for human review before writing to the canonical record. Provenance is tracked per field.
- **Saved views** — filter/sort state for any entity list, persisted per user.
- **Audit log** — every write produces an `AuditLog` row with actor, entity, before/after.
- **Agent framework** — `Agent`, `Conversation`, `Message` tables model long-running AI agents as first-class domain objects, not afterthoughts.
- **Analytics dashboard** — drill-through on every metric, designed as a user-friendly replacement for the team's Excel workflows.

---

## Running locally

```bash
cd web
cp .env.example .env.local         # fill in Supabase + database URLs
npm install
npx prisma migrate deploy
npm run dev                        # http://localhost:3000
```

Tests:

```bash
npm run test
```

---

## Engineering principles

- **No fake data.** Empty states are empty — never lorem-ipsum'd or seeded with placeholders.
- **Conventional commits.** `feat(scope): …`, `fix(scope): …`, `chore(scope): …`.
- **Trunk-based with PRs.** `main` is stable. `dev` integrates feature branches. No direct pushes.
- **Schema is the contract.** Migrations are reviewed like code; the Prisma schema is the single source of truth for the domain.
- **Server-first.** RSC by default; client components only where interactivity demands it.
