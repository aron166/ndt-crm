# Stack — Helm CRM

## Current stack (live)

| Layer | Tech | Notes |
|---|---|---|
| App framework | Next.js App Router | Single process, single deploy. Server actions kill REST boilerplate. |
| Database | Supabase (managed Postgres + RLS) | Project ref: `ortqjkzoghrkzypmlvbb`, region: `eu-central-1` |
| ORM | Prisma 7 | Schema: `web/prisma/schema.prisma`. Never bypass. |
| Auth | Supabase Auth | Magic link + password. `@supabase/ssr` for session cookies. |
| UI | React 18 + Tailwind + shadcn/ui | Dark industrial theme. Design tokens in `globals.css`. |
| AI | Groq (llama-3.3-70b) | Used in enrichment engine. Claude for future per-feature AI. |
| Deploy | Vercel (Next.js) + Supabase | Vercel points at `web/` as root directory. |
| Language | TypeScript everywhere | No Python. ETL is TypeScript scripts. |

## File structure

```
ndt-crm/
├── web/                          ← the active Next.js app (Vercel root dir)
│   ├── prisma/
│   │   └── schema.prisma         ← authoritative data model
│   ├── src/
│   │   ├── app/
│   │   │   ├── (app)/            ← protected routes (auth required)
│   │   │   │   ├── page.tsx      ← dashboard
│   │   │   │   ├── companies/    ← list + [id] detail
│   │   │   │   ├── persons/      ← list + [id] detail
│   │   │   │   ├── tasks/        ← list + kanban toggle
│   │   │   │   ├── deals/        ← kanban, pipeline config
│   │   │   │   ├── analytics/    ← KPI dashboard + /invoices drill-through
│   │   │   │   ├── invoices/     ← year tabs + search
│   │   │   │   └── settings/     ← general + integrations tab
│   │   │   ├── login/            ← public auth page
│   │   │   ├── api/
│   │   │   │   ├── events/       ← POST /api/events (ecosystem hub, service-key auth)
│   │   │   │   └── conversations/← POST /api/conversations (ecosystem hub)
│   │   │   └── actions/          ← all DB mutations (server actions, no REST)
│   │   ├── components/           ← shared UI components
│   │   │   └── ui/               ← shadcn primitives
│   │   └── lib/
│   │       ├── prisma.ts         ← singleton Prisma client
│   │       ├── supabase/         ← server + client Supabase helpers
│   │       └── utils.ts          ← formatHUF, formatDate, cn
├── etl/                          ← xlsx → Supabase migration (ts-node, run manually)
│   └── src/                      ← re-run with npm run migrate:reset to reload data
├── redesign/                     ← Áron's mockup reference (READ ONLY)
├── ADR/                          ← architecture decision records
├── STATUS.md                     ← session log (append only)
└── CLAUDE.md                     ← entry point (slim — points here)
```

## Auth flow

Protected routes live under `(app)/` route group. The group `layout.tsx` checks the Supabase session server-side and redirects to `/login` if missing. Auth callback at `/api/auth/callback`. Magic link + password both supported.

## Local dev

```bash
cd web
npm run dev   # → localhost:3000
```

Env vars needed: `DATABASE_URL` (Supabase pooler, transaction mode, `?pgbouncer=true`), `DIRECT_URL` (direct connection for migrations), `NEXT_PUBLIC_SUPABASE_URL`, `NEXT_PUBLIC_SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `GROQ_API_KEY`.

## What does NOT exist anymore

NestJS backend, Vite SPA, Docker Compose, custom JWT auth — all deleted. Don't reference these.
