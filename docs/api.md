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
    "utm_source": "gmail",
    "qualification": {
      "intent_path": "task",
      "situation": "company",
      "concrete": "wall",
      "goal": "drill",
      "size": "kb. 40 m2",
      "postcode": "9024",
      "timing": "this_week",
      "own_device": "maybe"
    },
    "send_intro": true
  }'
# → 201 { "ok": true, "leadId": 12, "tier": "A", "intro": "email", "companyId": 3, "personId": 7 }
```

| field | notes |
|---|---|
| `company_name` | required |
| `contact_email` **or** `contact_phone` | at least one |
| `contact_name`, `message`, `service_interest`, `source` | optional |
| `channel` | `cold_email · landing · linkedin · meta_ads · referral · import · manual` (default `landing`) |
| `campaign` | free text tag |
| `utm_*`, `referrer`, `landing_variant`, `lead_score`, `priority` | stored on `custom_fields` |
| `qualification` | optional `{ slug: answer }` — the locked qualification model, see below |
| `send_intro` | optional bool — send the termékismertető now (see below) |

Company is deduped by name (case-insensitive), person by email. The lead lands in
the tenant's initial column (`new`) and fires `lead_created` automations (whose
condition fields now include `tier`).

Response: `leadId`, `companyId`, `personId`, plus `tier` (`A|B|C|D|E|null`) and,
when `send_intro` was true, `intro` (`email` — sent and logged · `task` — a
"Küldd el a termékismertetőt" task was created instead · `skipped` — it failed and
was reported; the lead itself is still created).

#### `qualification` — the locked model (2026-09-07)

**The slugs are permanent.** One intake for every channel; the `gate` question
branches. Send only the answers you have — a partial object is fine, it just may
not place the lead in a tier.

| branch | slugs |
|---|---|
| gate (everyone) | `gate` — `task` \| `curious`. **`intent_path` is accepted as an alias** and is stored as `gate`. |
| A — `task` | `situation` (`company` \| `pro` \| `private`) · `concrete` (`wall` \| `slab` \| `bridge` \| `other`) · `goal` (`drill` \| `condition` \| `technology`) · `size` · `postcode` · `timing` (`this_week` \| `this_month` \| `no_date`) · `own_device` (`yes` \| `maybe` \| `no`) |
| B — `curious` | `hook` · `use_case` · `work` (+ email). No postcode, no date → nurture pool. |

Values are free text (≤2000 chars each): the tokens above are what the landing
form posts, but the CRM also reads a setter's Hungarian ("cég", "födém", "talán",
"ezen a héten"). Unknown slugs are **stored, not rejected**, on intake — losing a
real answer to a renamed question is worse than an orphan key. (`PATCH` is
stricter: see below.)

#### `tier` — derived, never submitted

`leads.tier` is recomputed from the answers on **every** write (intake, setter
panel, `PATCH`). It is a column, so the board filters and counts on it.

| tier | rule | response Péter expects |
|---|---|---|
| **A** machine prospect | `situation=company` **and** (`own_device` ∈ {`yes`,`maybe`} **or** `goal=technology`) | call within 1 h |
| **B** company job | `situation=company`, concrete structure, `timing` set | call same day |
| **C** professional | `situation=pro` | call within 2 days |
| **D** private | `situation=private` | auto-email, booked only when we're in the area |
| **E** nurture | `gate=curious` | intro PDF, no human effort |
| `null` | not placeable yet (no `situation`, or a company with neither a machine signal nor a datable concrete job) | — |

A **missing** answer never promotes: the spec's literal "own_device ≠ no" would
make every partial payload a tier A, so A requires an explicit positive signal.

Free-typed answers (what a setter puts in the panel, as opposed to the landing
form's tokens) are matched on **word boundaries**, not substrings, and a keyword
sitting inside a negation is ignored — "nem a technológia érdekel" is not
`goal=technology`. `hanem` / `de` end the negation, so "nem tégla, hanem beton"
still reads as concrete.

When an answer carries **two** competing tokens, the one the lead said **first**
wins: "Igen, de még nem döntöttünk" is `own_device=yes`, not `no`. Keyword-table
order only breaks a tie at the same position.

Tier A needs a **positive** machine signal — `own_device` answered yes/maybe
(including purchase intent: "vásárolnánk", "beszerezzük"), or an explicit
statement about the technology. Asking *about* our instruments ("Milyen
műszerrel csinálják?") is an ordinary inbound question and tiers nothing.

A `timing` answer counts as "set" only when it names a timeframe. Undecided
phrasings ("még nem dőlt el", "valamikor ősszel", "majd", "nem tudjuk") do not,
so they cannot promote a company lead to B.

> ⚠️ **`tier` only reaches an automation at intake.** `POST /api/leads` puts the
> derived tier into the `lead_created` event, so a "tier A → call within 1 h"
> rule fires for leads the landing form already tiered A. A setter who promotes a
> lead to A **on the phone** updates the column and the badge but fires **no**
> automation — `setLeadQualification` emits no event. Adding a
> `lead_tier_changed` trigger is a product decision, not a bug fix; it is Áron's
> call. (Vanda, #81.)

#### `send_intro`

> ⚠️ **Not idempotent.** A retried or double-submitted `POST /api/leads` creates a
> second lead *and* a second intro email or task; the company/person dedupe does
> not cover it. The landing form must not retry blind. (Vanda, #81 — deferred,
> needs a dedupe-window decision.)

`true` → the intro email goes out immediately, and is logged as an outbound
interaction, when **all three** hold: the Resend integration is connected, a
`contact_email` was given, and `tenants.settings.introMaterialUrl` holds an
`https://` link (set at `/leads/setup`).

Otherwise a task **"Küldd el a termékismertetőt"** is created on the lead, due
tomorrow, with the audit `reason` naming which one was missing —
`no_intro_url`, `no_email` or `resend_unavailable`. In particular, with **no
link configured the mail is never sent**: a task is created instead, because
emailing a customer a placeholder where the link should be is worse than
telling a human to send it. Intake never fails because the email did.

### `GET /api/leads` — list (paginated, never unbounded)

```bash
curl "$CRM/api/leads?status=recall&outcome=open&assigned_to=2&page=1&page_size=25" \
  -H "Authorization: Bearer $KEY"
# → 200 { "ok": true, "items": [ …lead… ], "page": 1, "page_size": 25, "total": 3, "total_pages": 1 }
```

Filters: `status` (column key), `outcome` (`open|won|lost`), `assigned_to` (user id),
`page` (1-based), `page_size` (≤100, default 25). Sorted newest first.

### `GET /api/leads/:id` — detail

Returns the lead with `qualification` (the setter answers), `company`,
`contact.person`, the last 50 `interactions`
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
| `outcome` | `won` → converts to a deal (returns `converted_deal_id`) · `lost` — **`lost_reason` required** (3–500 chars free text) · `open` re-opens a lost lead |
| `lost_reason` | only valid together with `outcome: "lost"`, and mandatory with it |
| `assigned_to_id` | user id or `null` |
| `custom_fields` | shallow-merged; a `null` value deletes the key (≤16 KB) |
| `qualification` | setter answers, **merged**: `{ "<question slug>": "<free text>" }`. Every submitted slug is authoritative, so `""` clears that answer. A slug the tenant does not currently ask about is a `400` — see below |

Order applied: assign → custom_fields → qualification → status → outcome. First failure returns
`400 { error }` (earlier steps stay applied). Response: `{ ok, lead }`.

### `POST /api/leads/:id/interactions` — log a call outcome

Same payload and **same rules as the "Hívás eredménye" modal** (one shared server
function): a note is always required; `callback_requested` needs `callback_at`
(date **and** hour); `meeting_booked` needs `demo_with`; `not_interested` and
`disqualified` need a **`lost_reason`** (3–500 chars) — the outcome key alone is
not a reason (Péter, 2026-09-07).

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
| `not_interested`, `disqualified` | **requires `lost_reason`**; lead `outcome = lost`, `lost_reason` = that free text (the outcome key stays on the interaction row); leaves the board |
| `callback_requested` | creates a `call` task due at `callback_at` (assigned to `assigned_to_id`), moves to `recall` |
| `meeting_booked` | moves to `demo_aron` / `demo_peter` per `demo_with` (`aron|peter`) |

Any earlier open callback task for the lead is marked done (the call happened).
A closed lead (`won`/`lost`) rejects with `400` — re-open it first via PATCH.

### Setter qualification questions

The **answers** live on the lead (`qualification`); the **question list** is tenant
config (`tenants.settings.qualificationQuestions`, an ordered `{ slug, label }[]`,
edited at `/leads/setup`). They are split on purpose: re-wording a question keeps
the answers attached, and removing one does not destroy what was already captured.

```bash
curl -X PATCH $CRM/api/leads/12 \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "qualification": { "area_m2": "kb. 400", "deadline": "" } }'
# → sets area_m2, clears deadline, leaves every other answer alone
```

`GET /api/leads/:id` returns the current slugs plus `tier`; on **PATCH** an unknown
slug is rejected rather than stored, because a typo'd key would sit in the JSON
forever with no question to render it (intake is deliberately more forgiving —
see above). Answers are ≤2000 chars each. Every write recomputes `tier`.

The default list is the locked model's `gate` + Branch A seven + Branch B three,
with the spec's draft Hungarian marked ⚠️ until Áron signs off on the wording.

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
