# FOUNDATION
> The canonical development standard for the Árpil software portfolio.
> Read this before starting any new product. Non-negotiable by default.
> Last updated: 2026-04-24

---

## Why This Exists

You are building a portfolio of interconnected products:
NDT brokerage, CRM/ERP, consumables marketplace, education platform, marketing automation, grant automation, and eventually JARVIS — the orchestration layer that builds businesses from voice.

These products share data, share users, share infrastructure. If each one is vibe-coded independently with whatever stack felt right that week, they won't connect. Rebuilding costs 10x more at month 6 than it costs to set up the right structure at month 1.

This document is the answer to: "what is THE way we build everything?"

---

## The Non-Negotiables

These are settled. Never re-debate them.

1. **TypeScript everywhere.** No Python. No JavaScript without types. One language = one mental model = AI agents don't context-switch.
2. **One monorepo.** All products live in one repo. Shared packages enforced by structure, not discipline.
3. **One database platform.** Supabase. One auth layer across all products.
4. **No custom auth.** Supabase Auth only. Never roll your own.
5. **RLS on every table before production.** No exceptions. Ever.
6. **Timestamps on everything.** `created_at`, `updated_at` on every table. Non-negotiable.
7. **Background jobs through Trigger.dev.** Never `setTimeout`, never cron hacks, never raw queues.
8. **Email through Resend.** Never raw SMTP, never other providers.
9. **Feature branches only.** Never commit to main. Never.
10. **Read the diff before every commit.** You are the last line of defense against AI-generated mistakes.

---

## The Stack

| Layer | Choice | Notes |
|---|---|---|
| Language | TypeScript (strict) | Everywhere. No exceptions. |
| Monorepo | Turborepo + pnpm workspaces | One repo, all products |
| App framework | Next.js 15 (App Router) | Server actions replace a separate API layer |
| UI | Tailwind CSS + shadcn/ui | Shared component library across all apps |
| Database | Supabase (PostgreSQL) | One project, multiple schemas per product |
| Auth | Supabase Auth | Role-based, shared identity across products |
| Realtime | Supabase Realtime | Live UI updates (timers, dashboards) |
| File storage | Supabase Storage | Documents, uploads, attachments |
| Background jobs | Trigger.dev | Durable workflows, delays, retries — cloud managed |
| Email | Resend + React Email | Templates as React components |
| AI | Anthropic Claude API | claude-sonnet-4-6 default, claude-opus-4-7 for complex reasoning |
| Payments | Stripe | When needed. Not before. |
| Deployment | Vercel (apps) | Zero-config Next.js, per-app deployments |

**What NOT to use:**
- No Express, Hono, NestJS, Fastify — Next.js server actions are the backend
- No Prisma, Drizzle — use Supabase client + generated types (`supabase gen types typescript`)
- No self-hosted infrastructure
- No multiple cloud providers — one Supabase project, one Vercel team
- No separate auth systems per product

---

## The Monorepo

### Structure

```
arpil/                          ← root repo (named after the holding entity)
├── apps/
│   ├── ndt-platform/           Next.js — NDT brokerage marketplace + CRM (BUILD THIS FIRST)
│   ├── v-gen/                  Next.js — grant automation (future)
│   ├── ndt-education/          Next.js — education platform (future)
│   ├── ndt-consumables/        Next.js — consumables marketplace (future)
│   └── jarvis/                 Next.js — orchestration layer (final product)
├── packages/
│   ├── ui/                     Shared shadcn/ui components + design tokens
│   ├── supabase/               Supabase client singleton + generated types + shared queries
│   ├── email/                  Resend + React Email templates
│   └── ai/                     Claude API client + shared system prompts
├── tooling/
│   ├── eslint/                 Shared ESLint config
│   └── typescript/             Base tsconfig.json
├── turbo.json
├── pnpm-workspace.yaml
└── FOUNDATION.md               ← this file
```

### Rules
- Each `apps/` entry is an independently deployable Next.js app
- Each `packages/` entry is a shared library, never deployed alone
- Breaking changes to a package require checking all apps that import it
- Apps NEVER import from other apps — only from `packages/`
- If two apps need the same logic, extract it to a package

---

## The Data Layer

### One Supabase Project, Multiple PostgreSQL Schemas

All products use one Supabase project. The `public` schema holds shared entities. Each product gets its own PostgreSQL schema.

```
public schema (shared across all products):
  - persons           Human beings. Persist across employers.
  - companies         Organizations. Deduplicated on VAT number.
  - contacts          Person ↔ Company relationship (time-bound).
  - users/profiles    Auth identity + role claims

ndt_platform schema:
  - labs, lab_pricing_schemas, projects, quotes, comparisons, commissions

crm schema:
  - crm_contacts, interactions, tasks, deals, leads, invoices

education schema:
  - courses, lessons, enrollments, competency_scores

consumables schema:
  - products, suppliers, orders, deliveries
```

### Why This Structure

- The same NDT professional appears as: a lab partner (ndt_platform), a practitioner (education), a contact in Péter's CRM. One `persons` row, three product relationships.
- JARVIS can query across all schemas because it's the same database.
- When selling a product (e.g., the education platform becomes independent), the schema gets migrated to its own Supabase project. Zero data redesign.
- RLS policies on each schema enforce that each product only sees what it owns.

### Type Generation

After any schema change, always run:
```bash
supabase gen types typescript --local > packages/supabase/types.ts
```
Never write database types by hand. They drift. Generated types are the truth.

---

## Vibe Coding Rules

These are the habits that prevent the empire from becoming spaghetti.

### Before Writing Any Code

**Rule 1: No session without a CLAUDE.md.**
Every app and package has a CLAUDE.md. The agent reads it on start. It contains: what this thing is, what packages it uses, what's already built, what's next, what NOT to do. If there's no CLAUDE.md, write it before any code. Agents without context make architectural mistakes.

**Rule 2: Schema before feature.**
Before building any feature, write the schema change first. SQL migration or Supabase dashboard — doesn't matter. Commit the migration. Then run type generation. Then build the feature. Agents that work from generated types make fewer mistakes than agents that invent types.

**Rule 3: Feature branch first.**
`git checkout -b feature/[name]` before the agent writes a single line. If it goes wrong, `git reset --hard HEAD` puts you back. Never let an agent work on main.

### During a Session

**Rule 4: One agent, one domain.**
A session builds one feature end-to-end — but doesn't also refactor unrelated things, change the schema, and redesign the auth flow in the same session. Specialist agents make fewer mistakes. If you notice scope creeping, stop the session and start a new one.

**Rule 5: No `any` in TypeScript.**
If an agent writes `any`, it's a signal the type isn't defined. Don't accept it. Ask the agent to define the type properly. `any` is technical debt that accumulates invisibly until the codebase becomes unmaintainable.

**Rule 6: Shared package changes need a flag.**
If an agent touches anything in `packages/`, make a note. That change affects every app that imports it. Don't commit it until you've verified the consuming apps still work.

### After Every Session

**Rule 7: Read the full diff.**
`git diff` the entire changeset before committing. AI agents do exactly what you asked — and sometimes things you didn't ask for. You are the last line of defense. Three minutes of reading catches 90% of problems.

**Rule 8: Happy path test before commit.**
Start the dev server. Click through the feature you just built. TypeScript compiling successfully is not the same as the feature working. Test the golden path manually. Every session. No exceptions.

**Rule 9: Commit what works, revert what doesn't.**
Never commit a broken state as a checkpoint. If part of the session worked and part didn't, commit the working part with `git add -p`, stash or revert the broken part. A broken main branch costs more time than a clean revert.

---

## Agent Setup

### The Three-Agent Model

Each active product runs up to three specialist agents in separate terminals:

| Agent | Directory | CLAUDE.md it reads | Responsibility |
|---|---|---|---|
| Schema agent | `packages/supabase/` | packages/supabase/CLAUDE.md | Migrations, RLS policies, type generation |
| Feature agent | `apps/[product]/` | apps/[product]/CLAUDE.md | Server actions, server components, API logic |
| UI agent | `packages/ui/` OR `apps/[product]/` | whichever is relevant | Client components, forms, layouts |

Don't mix these roles in one session. A feature agent that also rewrites the schema without a migration is a liability.

### What Every CLAUDE.md Must Contain

```markdown
# [App/Package Name] — Agent Context

## What This Is
[One paragraph. Purpose, who uses it, what problem it solves.]

## Stack Used Here
[Only the relevant parts of FOUNDATION.md for this app/package.]

## What's Already Built
[Bullet list. Be specific. Agents assume unbuilt things don't exist.]

## NEXT Task
[The single next thing to build. One task. Not a roadmap.]

## Non-Negotiables
[App-specific rules that override general defaults. Keep this short.]

## What NOT To Do
[The specific mistakes this agent is most likely to make here.]
```

### Starting a Session

```bash
# Always from the app or package directory, not the root
cd apps/ndt-platform
claude

# In the session, tell the agent:
"Continue with the next task."
# It reads its CLAUDE.md, finds NEXT, executes.
```

---

## Routines

### Before Any New Product

1. Create `apps/[product-name]/` in the monorepo
2. Write its `CLAUDE.md` (use the template above)
3. Design the DB tables: what schema, what columns, what foreign keys to `public`
4. Write the migration SQL — commit it before any app code
5. Run `supabase gen types typescript`
6. Write RLS policies — commit them before going to production
7. First commit: scaffold only (Next.js init, package imports, CLAUDE.md)
8. Then feature branches from there

### Before Every Agent Session

1. `git status` — are you on a feature branch? If not, branch now.
2. Open the app's CLAUDE.md — check what NEXT is
3. Confirm the schema is up to date (`supabase db status`)
4. Start the agent from the correct directory

### After Every Agent Session

1. `git diff` — read everything
2. `pnpm typecheck` — zero type errors before commit
3. Start dev server, test the happy path
4. Commit what works: `git add -p` if only part works
5. Update the app's CLAUDE.md: mark the NEXT task done, write the new NEXT task
6. If the task was significant, update the root STATUS.md

---

## New Product Checklist

Before writing a single line of application code for a new product:

- [ ] App directory created in `apps/`
- [ ] CLAUDE.md written for the app
- [ ] DB schema designed (tables, columns, FK relationships to `public`)
- [ ] Migration committed and applied
- [ ] Types generated (`supabase gen types typescript`)
- [ ] RLS policies drafted (can be tightened later, but structure must exist)
- [ ] Auth roles defined (who are the users? what roles do they have?)
- [ ] Shared packages identified (which `packages/` does this app consume?)
- [ ] Feature branch created
- [ ] Scaffold committed (Next.js init + package.json + CLAUDE.md only)

---

## Product Roadmap

### Current Priority: ndt-platform

The NDT brokerage/marketplace platform. Three portals (client, lab, admin) in one Next.js app. CRM lives in admin. This is the revenue generator.

Build sequence:
1. Monorepo setup + shared packages scaffold
2. Supabase schema (full — covers both marketplace and CRM)
3. Follow the 6-phase plan in `QuoteFeatureContext/NDT_Platform_Technical_Plan.md`

### After ndt-platform Ships

| Product | Depends On | Priority |
|---|---|---|
| Marketing Automation | ndt-platform CRM (lead destination) | High |
| V-Gen | Organizational knowledge base (wiki) | Medium |
| NDT Education Platform | Persons/companies shared data | Medium |
| NDT Consumables Marketplace | Persons/companies shared data | Lower |
| JARVIS | All other products operational | Final |

### JARVIS is Not a Product. It's a Layer.

JARVIS is the apex: a voice-to-business orchestration system that uses every other product as a subsystem. It cannot be built first — it requires all the agents and systems it orchestrates to exist.

Build everything else. JARVIS emerges from the pattern.

The architecture that makes JARVIS possible is the same architecture you're building now:
- One monorepo (JARVIS imports from all packages)
- One Supabase project (JARVIS queries across all schemas)
- One auth layer (JARVIS acts as an admin across all products)
- Trigger.dev (JARVIS orchestrates multi-step workflows)
- Claude API (JARVIS reasons and delegates)

Every product you build the right way is a JARVIS subsystem that already works.

---

## The Structural Separability Rule

Each product must be independently extractable and sellable. Péter can sell Controllabor with the CRM as an asset. He can spin off the education platform. This requires:

1. Each app deploys independently (Vercel: one app = one deployment)
2. Each app owns its Supabase schema — when extracted, the schema migrates with it
3. Shared entities (persons, companies) stay in `public` and are copied/migrated if a product is sold
4. IP ownership flows through Árpil — the software is owned by the holding entity, rented by each operating company

---

## When Things Go Wrong

Because they will.

**Code is broken after an agent session:**
```bash
git reset --hard HEAD   # back to last commit, agent work gone
```
This is why you commit working state before every session.

**Types are wrong after a schema change:**
```bash
supabase gen types typescript --local > packages/supabase/types.ts
pnpm typecheck
```

**Two apps are out of sync on a shared package:**
Check which version each app imports. Update to the same version. Run typecheck across the repo.

**An agent made architectural decisions you didn't ask for:**
Read the diff. Revert what you didn't ask for with `git checkout [file]`. The agent was trying to help — but you own the architecture, not the agent.

**A feature works locally but breaks on Vercel:**
Environment variables. Check that every `process.env.*` used in the app is set in the Vercel project settings. Supabase URL and anon key are the most common miss.
