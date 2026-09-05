# Codex whole-codebase review — 2026-09-04 — Kai's triage

Source: Codex review of `web/` (10 findings). Triage against locked decisions (ADR/008,
tenant decoupling queued). Owner of fixes: Nate.

## Batch A — fix NOW (before/with Phase 1 PRs)

| # | Finding | Fix |
|---|---|---|
| 1 | `getActor` (`lib/actor.ts:14`) auto-provisions ANY signed-in Supabase email into tenant 1; signups are enabled | Reject sessions whose email is not already a CRM user (no auto-provision). Invite flow = Áron inserts the user row. RBAC later. |
| 3 | `/api/events` + `/api/conversations`: legacy service-key path lets body pick `tenantId`; `sourceApp` spoofable from body | Delete the legacy path. Tenant + sourceApp ONLY from the app key. Scope every referenced person/company/agent lookup by tenant. |
| 7 | `integrations/resend.ts:109` swallows interaction/audit write failure after a successful send | `reportError` + return a warning; no silent success. |
| 10 | `20260904100000_lead_board_v2` deletes tenant-1 custom statuses and rewrites live statuses | Map every existing lead status → new key (unknown → `new`) BEFORE deleting old rows; precondition check; document mapping in the migration. |
| 6b | Automation-created tasks (`engine.ts:231`) never audited | Add `audit()` with actor = system/rule id. |

## Batch B — before the cold-email motion goes live (Phase 2/2b gate)

| # | Finding | Fix |
|---|---|---|
| 5 | Automations have no firing/idempotency key; `sendOnce` records AFTER sending → duplicates on retry/concurrent cron | `automation_firings` (rule_id, event_key unique) claimed in a tx BEFORE side effects; skip on conflict. Event key = immutable event id (lead id + status + ts, or interaction id). |
| 8 | Lead/deal boards + import load everything unbounded | Per-column `take` (e.g. 100) + count badge; import: batch lookups by chunk. |
| 6a | Audit via `after()` is non-blocking → mutations can be unaudited | Move `writeAuditLog` into the same Prisma tx as each mutation (one helper, sweep call sites). Keep `after()` only for failure notification. |

## Batch C — folded into tenant decoupling (queued; single tenant today)

| # | Finding |
|---|---|
| 2 | Tagging has no tenantId / target not tenant-checked |
| 4 | Pipeline stages, custom fields, moveDeal accept foreign ids |
| 9 | Older actions parse FormData manually without Zod / tenant-scoped resolver |

Rule from now: every NEW action/route uses Zod + a shared tenant-scoped entity resolver.

## Ignored
Non-concurrent index creation (tables tiny; Prisma migrations are transactional anyway).
