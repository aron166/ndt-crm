# Backend Session Context — NDT CRM

> This file layers on top of the root `CLAUDE.md`. Read that first for project overview, data model, naming conventions, and non-negotiables.

## Role

You are a senior NestJS developer on this project. Your job is to pick the next `[ ] NEXT` task below and execute it completely and correctly, following all patterns in this file and the root CLAUDE.md.

**At the end of every session:** update `/STATUS.md` — mark what you completed, update "APIs ready for frontend", set what's next. Keep it to 2-3 lines in the session log.

---

## Module Structure (mandatory pattern)

Every module follows this exact layout — no exceptions:

```
modules/companies/
├── companies.module.ts
├── companies.controller.ts   ← HTTP only, no logic
├── companies.service.ts      ← all business logic
├── companies.repository.ts   ← all Prisma queries
├── dto/
│   ├── create-company.dto.ts
│   └── update-company.dto.ts
└── entities/
    └── company.entity.ts
```

## Environment Status

- PostgreSQL running on port `5434`. Migrations applied: `init` (all 13 tables) + `add_user_password`.
- Seed applied: Tenant 1 = Controllabor Kft., User 1 = admin@controllabor.hu / admin1234 (bcrypt)
- DB is live and ready — do not re-run migrations or seed.

---

## Hard Rules

- **Never call Prisma from a controller or service.** Only repositories touch `this.prisma`.
- **Every query must filter by `tenantId`** — no exceptions, ever.
- **DTOs validate all input** — use `class-validator` decorators on every field.
- **No `any` in TypeScript** — define the type.
- **Return shape:** `{ data: T }` for single, `{ data: T[], meta: PaginationMeta }` for lists.
- **Soft deletes** where records have historical value (deals, interactions can't be deleted).
- **Interactions are append-only** — no UPDATE or DELETE endpoint for interactions.
- **Timestamps on everything** — `created_at`, `updated_at`, `completed_at` where relevant.

## Auth Pattern

`JwtAuthGuard` on all protected routes (apply globally or per controller).
`CurrentUser` decorator extracts `{ userId: number, tenantId: number }` from JWT payload.
`TenantGuard` ensures `tenantId` in request matches JWT — no cross-tenant access.

## main.ts Bootstrap Checklist

- `app.setGlobalPrefix('api')`
- `app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }))`
- `app.enableCors({ origin: process.env.FRONTEND_URL })`
- Listen on port `3001`

## Prisma

`PrismaModule` is global — import once in `AppModule`, inject `PrismaService` anywhere.
`PrismaService` implements `OnModuleInit` — calls `$connect()` on boot.

## Environment Variables

All env access via `ConfigService` from `@nestjs/config` — never `process.env` directly in code.

---

## Task List

Mark tasks `[x]` when done. Move `NEXT` label to the following task.

### Phase 1 — Foundation

- [x] Bootstrap NestJS app: `main.ts` (prefix, ValidationPipe, CORS), `AppModule`, `ConfigModule.forRoot()`
- [x] `PrismaModule` + `PrismaService` — global singleton, `onModuleInit` `$connect()`
- [x] First migration (`prisma migrate dev --name init`) + seed: create Tenant 1 (Controllabor Kft.), seed admin User
- [x] Auth module: `POST /api/auth/login` → JWT, `JwtAuthGuard`, `CurrentUser` decorator, `TenantGuard`
- [x] `Dockerfile.dev` for hot-reload backend container

### Phase 2 — Core Modules

- [x] **Companies** — CRUD + list with pagination/search/status filter; VAT dedup on create; exclude F.A. from default queries
- [x] **Persons** — CRUD + search by name/email/phone
- [x] **Contacts** — create/close (set `ended_at`) relationships; list active contacts per company; full history per person
- [x] **Tasks** — CRUD + subtask hierarchy (`parent_task_id`); recurrence rule storage; `estimated_minutes` vs `actual_minutes` diff endpoint
- [x] **Interactions** — POST only (append); GET list per company/person; no PUT/DELETE

### Phase 2.5 — Quote Feature (CURRENT PRIORITY — build this before resuming Phase 3)

**Context:** Automated quote pipeline for NDT inspection services. Inbound email → auto-reply with intake link → client fills chatbot form → system pre-generates quote from price catalog → Péter reviews in CRM → approves → PDF + Excel sent via Gmail. Speed is the strategic moat (40% of NDT contracts won by quoting fastest).

**Quote structure:** 5 fee groups — MRD (call-out flat), KID (travel/distance), SZD (personnel hourly), VID (inspection per type+qty), DOD (documentation). All line items come from an annual price catalog. Discounts set per quote per line item. Quote number format: `[CLIENT_CODE]-[YYYYMMDD]-[SEQ]-V18`. Quote links to a Lead (new company) or Deal (returning company), both nullable for flexibility.

**Schema migration — add these 4 tables:**
- `price_catalog` — (id, tenant_id, year, group_code, item_code, procedure_code, description, unit, list_price_huf, created_at)
- `intake_submissions` — (id, tenant_id, token uuid, email, company_name, contact_name, phone, part_name, quantity_desc, location, start_date, service_type, technologies[], personnel_count, documentation[], raw_json, status, created_at)
- `quotes` — (id, tenant_id, quote_number, client_code, version, recipient_person_id nullable, company_id nullable, lead_id nullable, deal_id nullable, subject, issued_date, valid_until, price_valid_until, status [draft/sent/accepted/rejected/expired], intake_submission_id nullable, pdf_path, xlsx_path, notes, created_by, created_at, updated_at)
- `quote_line_items` — (id, quote_id, catalog_item_id nullable, group_code, item_code, procedure_code, description, note, delivery_promise, unit, list_price_huf, quantity, subtotal_huf, discount_pct, discount_huf, unit_price_huf, total_huf, sort_order)

- [ ] **NEXT: Schema migration** — add `price_catalog`, `intake_submissions`, `quotes`, `quote_line_items` to `schema.prisma`; run migration
- [ ] **Price catalog module** — `GET /api/price-catalog?year=2026` (list all items); seeded by ETL (see etl/CLAUDE.md); no write endpoints needed from frontend
- [ ] **Quotes module** — `POST /api/quotes`, `GET /api/quotes` (paginated, filter by status/company/date), `GET /api/quotes/:id` (with line items), `PATCH /api/quotes/:id` (header + line items), `POST /api/quotes/:id/approve` (generate files + send), `POST /api/quotes/:id/preview` (generate PDF only, return path)
- [ ] **Quote generation service** — given an intake submission or manual inputs: auto-select catalog items by service type + technology + location + documentation choices; apply default quantities; return draft line items for Péter to review
- [ ] **Public intake API (no JWT)** — `POST /api/public/intake` (submit form → create intake_submission → trigger quote generation → notify Péter); `GET /api/public/intake/schema` (return form fields/options for chatbot renderer)
- [ ] **PDF generation service** — Puppeteer; render quote to PDF matching the 4-page template (Alap Adatok / Igények / Árak / Díjszámítás + Vállalási feltételek + Elfogadás sections); store at `uploads/quotes/[quote_number].pdf`
- [ ] **Excel generation service** — exceljs; render quote line items to xlsx matching the pricing template structure; store at `uploads/quotes/[quote_number].xlsx`
- [ ] **Gmail module** — (a) webhook receiver `POST /api/gmail/webhook` (Google Pub/Sub push subscription on info@controllabor.hu + peter.z.nagy@controllabor.hu); parse sender email + body; create intake_submission stub; send auto-reply with intake link via Gmail API; (b) `sendQuote()` internal method: attach PDF + xlsx, send to recipient email, called by quotes approve endpoint

### Phase 3 — Remaining CRM Modules (resume after quote feature ships)

- [ ] **NEXT (Phase 3): Deals** — CRUD + stage transition; list by pipeline stage
- [ ] **Leads** — CRUD + assign to user; status transitions
- [ ] **Invoices** — create + list (filter by year, company); read-heavy — add DB index on `issued_date`
- [ ] **Equipment** — CRUD; alert endpoint: calibration due within N days

### Phase 4 — AI

- [ ] **AI module** — Groq SDK (`llama-3.3-70b-versatile`); `POST /api/ai/query` natural language → structured filter; `GET /api/ai/briefing` morning task summary for current user
