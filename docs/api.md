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

When an answer carries **two** competing tokens, **keyword-table order decides**,
and each slot is ordered for the mistake that costs most:

- `concrete`, `gate` and `situation` put the **kill answer first** — "Falban, de
  nem beton" is not a concrete job, and "Érdeklődnék, de konkrét feladatunk van"
  is a task, not a browse.
- `own_device` is the one slot ordered **positive-first**, because the answer to
  "van saját műszered?" almost always opens with *nem*: "Nincs, de vásárolnánk
  egyet" and "Igen, de még nem döntöttünk" are both machine prospects. A bare
  "nem" with no positive anywhere still reads as `no`.

Tier A needs a **positive** machine signal — `own_device` yes/maybe (purchase
intent counts: "vásárolnánk", "beszerezzük", "gondolkodunk rajta"), or a
statement about the technology. An answer that **asks** something — an
interrogative opener plus a question mark, "Milyen műszerrel csinálják?",
"Milyen technológiával dolgoznak?" — states nothing about the lead and tiers
nothing.

A `timing` answer counts as "set" when it names a timeframe. **A named date
always wins:** "Október 5-én, majd egyeztetünk" and "Nem biztos, de október 5-én
kezdünk" are both set. Only when nothing in the answer points at a point in time
do the undecided phrasings ("még nem dőlt el", "nem tudjuk", "valamikor ősszel")
turn it off, so a shrug cannot promote a company lead to B.

> ⚠️ An answer with neither a date nor a shrug still counts as set — that is the
> long-standing permissive default, so junk like "igen" or "ok" in the `timing`
> slot reads as a date. Tightening it is a product decision (it would start
> dropping leads out of B), not a bug fix.

> ⚠️ **`tier` only reaches an automation at intake.** `POST /api/leads` puts the
> derived tier into the `lead_created` event, so a "tier A → call within 1 h"
> rule fires for leads the landing form already tiered A. A setter who promotes a
> lead to A **on the phone** updates the column and the badge but fires **no**
> automation — `setLeadQualification` emits no event. Adding a
> `lead_tier_changed` trigger is a product decision, not a bug fix; it is Áron's
> call. (Vanda, #81.)

#### `thread_key` — cold-email reply intake

A reply to a cold email we sent. Post it with the thread's key, the campaign, and
`channel: "cold_email"`:

```bash
curl -X POST $CRM/api/leads -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "company_name": "Vasmű Zrt.", "contact_email": "kovacs@vasmu.hu",
        "channel": "cold_email", "campaign": "BirdsView Q4", "thread_key": "birdsview-q4:42" }'
# → 201 { "ok": true, "leadId": 31, "tier": null, "companyId": 42, "personId": 88, "draftId": 5 }
```

`thread_key` is the string `threadKeyFor(campaign, companyId)` stamped on the
draft when it was sent (`lib/outreach/drafts.ts`), so a reply finds its way back
to the email that caused it. Three things follow from it:

1. **Idempotent.** If a lead already carries this thread key, **nothing is
   written** and you get **`200 { ok, leadId, deduped: true, companyId }`** with
   the original lead — no second lead, no second company, no intro email, no
   `lead_created` automation. The reply-intake skill is schedulable and will
   re-read the same Gmail thread; this is what makes that safe. Guaranteed by a
   unique index on `(tenant_id, thread_key)`, so two concurrent posts cannot
   both win — the loser also returns the 200.
2. **The company comes from the draft, not from the name.** We know exactly who
   we mailed, so `company_name` is not used for dedupe on these posts. That
   sidesteps the known weak spot of this intake (exact-name matching, which
   collapses every `"(magánérdeklődő)"` onto one row).
3. **The answered draft flips to `replied`** — only one in `sent` status, so a
   forged or stale key cannot promote a draft that never went out.

A `thread_key` that matches no draft is still accepted and still stored: the
lead is created by the ordinary path (name dedupe included) and `draftId` is
omitted. Nothing else about the intake changes, and a payload without a
`thread_key` behaves exactly as before.

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

## Outreach

The outreach queue is a drafting worklist: a drafting agent skill pulls undrafted
companies for a campaign, writes personalized emails, and posts them back as
`draft`-status rows for a human to review at `/outreach`. **Nothing here ever
sends an email** — approving and sending are human actions taken in that UI
(`Küldés`, via the tenant's Resend integration); this API can only create or
update rows already sitting in `draft` status.

### `GET /api/outreach/targets` — undrafted companies for a campaign

```bash
curl "$CRM/api/outreach/targets?campaign=BirdsView%20Q4&limit=50" \
  -H "Authorization: Bearer $KEY"
# → 200 { "ok": true, "items": [...], "campaign": "BirdsView Q4", "limit": 50, "total_remaining": 214 }
```

Returns companies with no `email_drafts` row yet for that campaign (any step),
excluding soft-deleted companies, "F.A." (under liquidation), and anything
outside the call cockpit's callable pipeline statuses — so status `0` (KUKA) and
`4` (Nem érdekelt), the people who already said no, are never handed to the
drafting agent. Each item carries the company facts
(`id, name, website, city, county, zipCode, warmth, teaorCode, teaorDescription,
scopeOfActivity, notes, ndtMethods, lat, lng`) plus up to 3 current `contacts`
(`{ personId, name, role, email, phone }`). `total_remaining` is the full
undrafted count, not capped by `limit`. `campaign` is required; a missing or
invalid `campaign`/`limit` (1-200, default 50) is a `400 { error, details }`.

> ⚠️ This does **not** return an enrichment dossier or a lead-scoring tier: the
> addendum's "dossier + tier" ask needs `companies.enrichment` /
> `closeness_score` (addendum item 2 — not built yet) and `tier`, which today
> only exists on `leads`, not `companies`. This endpoint returns only the
> company facts that exist right now; wire in the dossier/tier once addendum
> item 2 lands.

### `POST /api/outreach/drafts` — bulk upsert drafts

```bash
curl -X POST $CRM/api/outreach/drafts \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "drafts": [ { "companyId": 42, "campaign": "BirdsView Q4", "step": 1, "subject": "…", "body": "…", "toEmail": "info@example.hu" } ] }'
# → 200 { "ok": true, "created": 1, "updated": 0, "skipped": [] }
```

Upserts on `(companyId, campaign, step)` within the key's tenant, up to 200 items
per call. A new row is created in `status: "draft"`. An existing row is updated
only while it is still editable (`draft`/`failed`); one already `approved`,
`sent`, or `replied` is left untouched and reported back in `skipped` with
reason `"already_sent"` — a re-run of the drafting skill must never clobber
something a human already approved or that already went out. A `companyId`
outside the key's tenant is skipped as `"unknown_company"`, never a 500 and
never a cross-tenant write; a per-item failure is skipped as `"error"` rather
than failing the whole batch.

`personId` is accepted but **verified, not trusted**: it is kept only when that
person holds a `Contact` at that company in the key's tenant, and silently
dropped to `null` otherwise. Without that check an app key could address a draft
at any person row in the database and the send would resolve their email.

Sending is a separate, human act in `/outreach`, and it refuses to run at all
until `tenants.settings.outreachFooter` (the consent/unsubscribe line) is set.
A row is claimed into a `sending` status by one conditional update before Resend
is called, so a double-click or a retried request cannot put the same email in
front of the same company twice; a row left in `sending` means the process died
mid-send and is deliberately **not** re-sendable.

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
