# Helm CRM — HTTP API

Public, key-authenticated endpoints. Everything a human does on the lead board can
be done here, so a machine (n8n, a Claude Code routine, a voice agent) can drive
the same pipeline. Base URL: `https://ndt-crm.vercel.app`.

## Auth

Every request: `Authorization: Bearer helm_<key>`. Keys are minted per app in
**Settings → API kulcsok** (plaintext shown once; only the SHA-256 hash is stored)
and carry their own **tenant** and **sourceApp** — neither can be set from the body.
The Supabase service-role key is **not** accepted anywhere.

- `401` missing/invalid/revoked key · `429` over 30 req/min per key · `400` Zod
  validation failed (`details` = flattened field errors) · `404` entity not in the
  key's tenant.
- Wire format: JSON, **snake_case** keys, ISO-8601 datetimes (UTC).
- Writes are audited (`audit_log`, actor = the key's app slug) and, where a human
  would have left a trace, append an `interactions` row.

```bash
export CRM=https://ndt-crm.vercel.app
export KEY=helm_xxxxxxxx
```

## Leads

### `POST /api/leads` — create an inbound lead

```bash
curl -X POST $CRM/api/leads \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
    "company_name": "Teszt Kft",
    "contact_name": "Kiss Anna",
    "contact_email": "anna@teszt.hu",
    "contact_phone": "+36 30 123 4567",
    "message": "Érdekel a betonszkennelés",
    "service_interest": "GPR",
    "channel": "cold_email",
    "campaign": "gp8800-launch-1",
    "utm_source": "gmail"
  }'
# → 201 { "ok": true, "leadId": 12, "companyId": 3, "personId": 7 }
```

| field | notes |
|---|---|
| `company_name` | required |
| `contact_email` **or** `contact_phone` | at least one |
| `contact_name`, `message`, `service_interest`, `source` | optional |
| `channel` | `cold_email · landing · linkedin · meta_ads · referral · import · manual` (default `landing`) |
| `campaign` | free text tag |
| `utm_*`, `referrer`, `landing_variant`, `lead_score`, `priority` | stored on `custom_fields` |

Company is deduped by name (case-insensitive), person by email. The lead lands in
the tenant's initial column (`new`) and fires `lead_created` automations.

### `GET /api/leads` — list (paginated, never unbounded)

```bash
curl "$CRM/api/leads?status=recall&outcome=open&assigned_to=2&page=1&page_size=25" \
  -H "Authorization: Bearer $KEY"
# → 200 { "ok": true, "items": [ …lead… ], "page": 1, "page_size": 25, "total": 3, "total_pages": 1 }
```

Filters: `status` (column key), `outcome` (`open|won|lost`), `assigned_to` (user id),
`page` (1-based), `page_size` (≤100, default 25). Sorted newest first.

### `GET /api/leads/:id` — detail

Returns the lead with `company`, `contact.person`, the last 50 `interactions`
(newest first: `type`, `direction`, `outcome`, `notes`, `occurred_at`, `user_id`) and
`openTasks` (e.g. the pending callback).

```bash
curl $CRM/api/leads/12 -H "Authorization: Bearer $KEY"
```

### `PATCH /api/leads/:id` — move / close / assign / tag

```bash
curl -X PATCH $CRM/api/leads/12 \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "status": "call_2", "assigned_to_id": 2, "custom_fields": { "gmail_thread_id": "18f3…", "old_key": null } }'
```

| field | effect |
|---|---|
| `status` | move to a column (must exist for the tenant) — fires `lead_status_changed` |
| `outcome` | `won` → converts to a deal (returns `converted_deal_id`) · `lost` (+ optional `lost_reason`) · `open` re-opens a lost lead |
| `assigned_to_id` | user id or `null` |
| `custom_fields` | shallow-merged; a `null` value deletes the key (≤16 KB) |

Order applied: assign → custom_fields → status → outcome. First failure returns
`400 { error }` (earlier steps stay applied). Response: `{ ok, lead }`.

### `POST /api/leads/:id/interactions` — log a call outcome

Same payload and **same rules as the "Hívás eredménye" modal** (one shared server
function): a note is always required; `callback_requested` needs `callback_at`
(date **and** hour); `meeting_booked` needs `demo_with`.

```bash
curl -X POST $CRM/api/leads/12/interactions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "outcome": "callback_requested", "note": "Kedden 10-kor hívjuk vissza", "callback_at": "2026-09-08T08:00:00Z", "assigned_to_id": 2 }'
# → 201 { "ok": true, "interactionId": 91, "status": "recall", "outcome": "open", "taskId": 40 }
```

| `outcome` | what happens |
|---|---|
| `no_answer` | stage advances `new → call_1 → call_2 → call_3 → call_3_plus` |
| `wrong_number` | logged only |
| `not_interested`, `disqualified` | lead `outcome = lost`, `lost_reason` = the key; leaves the board |
| `callback_requested` | creates a `call` task due at `callback_at` (assigned to `assigned_to_id`), moves to `recall` |
| `meeting_booked` | moves to `demo_aron` / `demo_peter` per `demo_with` (`aron|peter`) |

Any earlier open callback task for the lead is marked done (the call happened).
A closed lead (`won`/`lost`) rejects with `400` — re-open it first via PATCH.

## Ecosystem hub

### `POST /api/events` — append an app event
`{ "eventType": "quote.created", "payload": {…}, "personId"?, "companyId"?, "agentId"? }` →
`201 { ok, event }`. `sourceApp` = the key's app. Payload ≤ 32 KB.

### `POST /api/conversations` — append an agent conversation
`{ "channel": "phone", "summary"?, "endedAt"?, "personId"?, "companyId"?, "agentId"?, "messages": [{ "role", "content" }] }` → `201 { ok, conversation }`.

### `POST /api/calls/result` — transcript / analysis of a recorded call
`{ "company_id", "person_id"?, "call_id"?, "transcript"?, "analysis"?, "duration_sec"?, "occurred_at"? }` →
`201 { ok, interactionId }`. Company-level (the Hívás mód cockpit), not lead-level.

## Automations (for reference)

Rules live in `/automations`. Triggers: `lead_created`, `lead_status_changed`,
`lead_idle` (days since last interaction, optional status filter), `deal_stage_changed`,
`deal_idle_in_stage`. Actions: `create_task`, `send_email`, `change_lead_status`,
`assign_lead`, `webhook_out` (POSTs `{ event, tenantId, leadId, dealId, companyId,
personId, company, fields, firedAt }` to your URL — the seam for n8n / a voice agent).
Time-based triggers run from the daily cron (`/api/cron/automations`, 07:00 UTC).
