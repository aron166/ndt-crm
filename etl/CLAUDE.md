# ETL Session Context — NDT CRM

> This file layers on top of the root `CLAUDE.md`. Read that first for project overview, data model, naming conventions, and non-negotiables.

## Role

You are a senior TypeScript data engineer on this project. Pick the next `[ ] NEXT` task below and execute it completely, following all patterns in this file and the root CLAUDE.md.

**At the end of every session:** update `/STATUS.md` — what you migrated, row counts loaded, what's next.

---

## Migration Strategy

**Do NOT re-process xlsx files.** The data is already normalized in the source DB.

| | Source | Destination |
|---|---|---|
| DB | `peter-data` PostgreSQL | `ndt-crm` PostgreSQL |
| Host | `localhost:5433` | `localhost:5434` |
| DB name | `crm_db` | `ndt_crm` |
| User/pass | `crm` / `crm` | `crm` / `crm` |

Read from source with raw `pg` queries. Write to destination via Prisma Client.

## Source Schema (peter-data tables)

| Source table | Rows | Maps to |
|---|---|---|
| `companies` | ~2,255 | `companies` |
| `contacts` | ~8,000 | `persons` + `contacts` (split!) |
| `interactions` | ~713 | `interactions` |
| `proposals` | ~266 | `proposals` |
| `invoices` | ~2,225 | `invoices` |
| `leads` | ~118 | `leads` |

## Key Transformation: Contacts → Persons + Contacts

The source has a flat `contacts` table (`company_id`, `name`, `phone`, `email`).
The new schema separates the human from the relationship:
- Each source contact row → one `Person` record + one `Contact` record
- Match on `email` first: if a Person with that email already exists, reuse it (don't duplicate)
- `Contact.startedAt = null`, `Contact.endedAt = null` (current, no historical dates available)
- Split `name` into `firstName` + `lastName` (split on first space; everything after = lastName)

## Other Transformation Rules

- All records get `tenantId = 1` (Controllabor Kft.)
- Source `pipeline_status` (0-8 string) maps directly — values already match
- Source `status` values: `'active'` → `'active'`, `'F.A.'` → `'fa'`, anything else → `'inactive'`
- Interactions: append-only, preserve `interaction_date` as `occurredAt`; source has no `personId` — leave null
- Invoices: `net_amount` stored as Decimal in HUF; link to company via `company_id` from source
- `users` table: create one system user (`id=1`, `name='Migration'`, `email='migration@system'`, `role='admin'`) before loading interactions that need a `userId`

## Stack & Patterns

- **TypeScript only** — no Python
- **Two DB connections:** source via `pg` (raw SQL reads), destination via Prisma Client
- **Run from `etl/` dir:** `ts-node src/migrate.ts`
- **Wrap each entity type in a Prisma transaction**
- **Log to `etl_runs` table** in destination: status, counts per entity, errors, timing
- **`--dry-run` flag:** read + validate source counts, do NOT write to destination
- **`--tenant-id <n>`** flag: default 1

## Expected Counts After Migration

Validate post-migration:
- ~2,255 companies
- ~2,225 invoices
- ~713 interactions
- ~266 proposals
- ~118 leads

Log discrepancies but do not fail — flag for manual review.

---

## Task List

Mark tasks `[x]` when done. Move `NEXT` label to the following task.

### Phase 1 — Initial Migration (complete)

- [x] Foundation: `pg` source client + Prisma destination client, `src/lib/source-db.ts`, `src/lib/prisma.ts`, CLI arg parser (`--dry-run`, `--tenant-id`), `etl_runs` write helper, system migration user seed
- [x] **Companies** — migrated, 2301 rows, 97% have VAT
- [x] **Persons + Contacts** — migrated, 136 persons / 137 contacts; sparse (only 15/136 have email, 53/136 have phone — source data was thin)
- [x] **Interactions** — migrated, 713 rows; NOTE: `type` field is NULL on all rows — source data didn't include it
- [x] **Proposals** — migrated, 238 rows; no deal_id links (deals table empty), no invoice_number extracted
- [x] **Invoices** — migrated, 2225 rows
- [x] **Leads** — migrated, 129 rows; 18 have NULL status
- [x] **Validation report** — validate script done

### Phase 2 — Data Quality Review (NEXT — do this before price catalog)

**Context:** Initial migration pulled from the normalized `peter-data` DB, which was itself extracted from large xlsx source files. The source xlsx files likely contain richer fields than what ended up in peter-data. Known gaps in current DB: interaction types all NULL, persons very sparse on email/phone, leads with missing status, proposals not linked to deals.

**Source files location:** original xlsx exports are in `etl/data/source/`. The normalized `peter-data` DB (port 5433) was itself derived from these. If peter-data is missing fields, go back to the xlsx files directly.

- [ ] **NEXT: Source inspection** — inspect original xlsx files (Áron will provide path); for each sheet, print column headers + 3 sample rows; identify columns NOT currently mapped that have useful data (especially: interaction type/channel/direction, person email/phone/role, proposal status details, lead source)
- [ ] **Second ETL pass** — if richer fields found: extend migration scripts to extract them; re-run `migrate:reset` to rebuild from scratch with better data; update validation expected counts

### Phase 3 — Price Catalog Import (needed for Quote Feature)

**Context:** The quote feature (currently being built in backend + frontend) needs a `price_catalog` table seeded with Control Labor's annual pricing. The source is an xlsx file (`etl/data/price-catalog.xlsx` — Áron will place it there). The pricing Excel has 5 fee groups: MRD (call-out), KID (travel), SZD (personnel), VID (inspection), DOD (documentation). Each group has line items with: group code, item code, procedure code, description, unit, list price in HUF. Prices are annual (currently 2026 year).

The `price_catalog` table schema (will be created by backend migration):
`(id, tenant_id, year, group_code, item_code, procedure_code, description, unit, list_price_huf, created_at)`

- [ ] **Price catalog parser** (`src/seed/price-catalog.ts`) — parse `etl/data/price-catalog.xlsx` with `xlsx` npm package; map each line item row to `price_catalog` insert; skip header/group rows; log count; idempotent (upsert on `year + item_code`)
- [ ] **Run + validate** — seed price catalog for year 2026; print count of items loaded per group
