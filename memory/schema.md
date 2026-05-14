# Schema — Helm CRM

Full source of truth: `web/prisma/schema.prisma`. This file is a quick-reference summary.

## All models

| Model | Table | Purpose |
|---|---|---|
| `Tenant` | `tenants` | Multi-tenancy root. Controllabor = tenant 1. Every other table has `tenant_id`. |
| `Person` | `persons` | A human being. Persists across employers. The permanent entity. |
| `Company` | `companies` | An organization. Deduplicated on `vat_number`. |
| `Contact` | `contacts` | Person ↔ Company relationship. Time-bounded (`started_at`, `ended_at`). `ended_at NULL` = still works there. |
| `User` | `users` | Controllabor staff. Roles: admin, manager, member. |
| `Lead` | `leads` | Inbound opportunity, pre-deal. |
| `Pipeline` | `pipelines` | User-defined sales pipeline. N pipelines per tenant. |
| `PipelineStage` | `pipeline_stages` | Stage within a pipeline. Has `probability` (0–100) for weighted forecast. |
| `PipelineCustomField` | `pipeline_custom_fields` | User-defined fields per pipeline. Types: text/number/date/single_select/multi_select/person/company. |
| `Deal` | `deals` | A sales opportunity. Belongs to pipeline + stage. `customFields` JSONB for pipeline-specific data. |
| `Proposal` | `proposals` | Offer document sent. Linked to deal. Historical proposals migrated from xlsx. |
| `Invoice` | `invoices` | Revenue records. Historical data back to 2010 (HUF). Some records not linked to company. |
| `Task` | `tasks` | Atomic work unit. Everything is a task. |
| `Interaction` | `interactions` | Append-only communication log. Never update/delete. |
| `Equipment` | `equipment` | NDT instruments. Serial numbers, calibration due dates. |
| `EtlRun` | `etl_runs` | Data load audit log. |
| `Tag` | `tags` | Cross-entity label. Color + name per tenant. |
| `Tagging` | `taggings` | Polymorphic join: tag ↔ company/person/deal/task/interaction. |
| `AuditLog` | `audit_log` | Append-only. Every create/update/delete on business tables. JSONB before/after diff. |
| `Agent` | `agents` | AI agent identity for ecosystem hub. |
| `Conversation` | `conversations` | Chat/call session. Links to person + company. Messages are child records. |
| `Message` | `messages` | Individual message in a conversation. |
| `IntegrationCredential` | `integration_credentials` | Encrypted credentials per integration slug (google_maps, google_calendar, resend, twilio). |
| `AppEvent` | `app_events` | Cross-portfolio event stream. VeloQuote/BirdsView/CashFlow write here via `/api/events`. |
| `EnrichmentRun` | `enrichment_runs` | Batch enrichment job (Groq LLM). Status: pending/running/done/failed. |
| `EnrichmentProposal` | `enrichment_proposals` | Per-entity enrichment suggestions. Human reviews before applying. JSONB `changes` field. |
| `EntityFieldDefinition` | `entity_field_definitions` | Tenant-configurable custom fields for company/person entities. |
| `TaskStage` | `task_stages` | Tenant-configurable task status stages. Maps to `task.status`. |
| `SavedView` | `saved_views` | Saved filter/sort state per user, per entity type. Shareable. |

## Key fields to know

**Task** — most complex model. Important fields:
- `type`: call | email | meeting | document | field_visit | internal
- `category`: revenue_generating | non_revenue
- `executorType`: human | ai_agent | robot
- `costCode`: KID | MRD | DOD | SZD | VIZSGALAT (schema exists, UI pending)
- `status`: created | in_progress | done | cancelled
- `estimatedMinutes` vs `actualMinutes` — normaidő comparison
- `parentTaskId` — subtask hierarchy
- `isRecurring` + `recurrenceRule` (RRULE string)

**Contact** — the time-bounded employment state:
- `personId` → `companyId` with `role`, `email` (work), `phone` (work)
- `startedAt` / `endedAt` (`endedAt NULL` = current position)
- `isPrimary` — main contact at this company

**Company** — key fields:
- `pipelineStatus`: 0=KUKA, 1=NEM HÍVTUK, 2=HÍVTUK NO ANSWER, 3=HÍVTUK INTERESTED, 4=NOT INTERESTED, 5=WANTS IT, 6=PENDING, 7=CL, 8=CW
- `status`: active | inactive | F.A. (F.A. = Felszámolás Alatt, under liquidation — exclude from most queries)
- `lat`/`lng`/`geocodedAt` — for Google Maps integration
- `customFields` JSONB — tenant-defined extra fields

## Counts (loaded in Supabase)

1,696 companies · 1,632 persons · 2,016 invoices · 663 interactions · 209 proposals
