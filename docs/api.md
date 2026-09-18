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

#### `tier` — derived by default, pre-settable at intake only

`leads.tier` is recomputed from the answers on **every** write (intake, setter
panel, `PATCH`). It is a column, so the board filters and counts on it.

`POST /api/leads` also accepts an optional `tier` in the payload, for a caller
that already knows it — cold-outreach leads arrive pre-tiered by research and
carry no qualification answers yet. That pre-tier is used **only** when the
payload carries no qualification answers, or when the answers are not yet
placeable (`computeTier` → `null`). The moment the answers do place the lead,
the derived tier wins and the submitted `tier` is ignored — so a setter filling
in answers later still takes over, while a half-answered reply never erases what
the research already knew.

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

#### `thread_key` + `draft_key` — cold-email reply intake

A reply to a cold email we sent. It takes **two** keys, because they answer two
different questions:

| field | what it identifies | grain |
|---|---|---|
| `thread_key` | the **email conversation** (the Gmail thread id) | one real conversation |
| `draft_key` | the **outreach** we sent — `email_drafts.thread_key` | campaign + company (shared by all 4 touches) |

```bash
curl -X POST $CRM/api/leads -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "company_name": "Vasmű Zrt.", "contact_email": "kovacs@vasmu.hu",
        "channel": "cold_email", "campaign": "BirdsView Q4",
        "thread_key": "gmail-thread-aaa111", "draft_key": "birdsview-q4:42" }'
# new reply   → 201 { "ok": true, "leadId": 31, "tier": null, "companyId": 42, "personId": 88, "draftId": 5 }
# seen before → 200 { "ok": true, "leadId": 31, "deduped": true, "companyId": 42 }
```

**Why two keys.** `draft_key` is `threadKeyFor(campaign, companyId)` and is
identical for touches 1-4, so using it for idempotency would mean *one lead per
campaign per company*: a prospect who answers "not now" to touch 1 and "send the
quote" three weeks later would have the second reply silently swallowed as a
duplicate. `thread_key` is per conversation, which is what idempotency actually
needs.

1. **Idempotent on `thread_key`.** If a lead already carries it, **nothing is
   written** and you get `200 { deduped: true }` with the original lead — no
   second lead, no second company, no intro email, no `lead_created` automation.
   A unique index on `(tenant_id, thread_key)` is the guarantee, so two
   concurrent posts cannot both win; the loser also returns the 200. Both keys
   are lowercased on the way in, so a case variant is the same key.
2. **A thread key must be vouched for.** It is honoured **only** when
   `channel` is `cold_email` **and** `draft_key` resolves to a real draft of
   yours. Otherwise it is dropped and the post takes the ordinary intake path.
   This endpoint is CORS-open and draft keys are enumerable, so an unvouched key
   would let anyone with a tenant app key claim a thread — burning it, so the
   genuine reply later returns `deduped: true` and is silently discarded.
3. **The company comes from the draft**, not from dedupe-by-name on whatever the
   replier typed — sidestepping the weak spot of this intake (exact-name
   matching collapses every `"(magánérdeklődő)"` onto one row).
4. **A reply stops the sequence.** The answered draft goes `sent → replied`
   (only a *sent* draft can be replied to), and every still-queued touch for that
   company and campaign goes `draft`/`approved` → **`cancelled`**, so nobody can
   later send cold touch 3 to someone who already answered.

5. **Campaign dashboard fields (2026-09-17).** The answered draft also gets
   `replied_at` (now) and, when sent, `reply_type` — one of `interested`,
   `question`, `forwarded`, `not_now`, `no`, `unsubscribed`, `auto_reply`
   (optional; anything else is a `400`). The new lead inherits the draft's
   `campaign` when the payload has none.

`draftId` in the response names the draft this reply answered (newest sent touch
first). A payload with no `thread_key` behaves exactly as it always has.

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

#### Booking a demo (2026-09-17) — optional for API callers, NOT a breaking change

`outcome: "meeting_booked"` can now also schedule the demo. **For app-key
callers the two fields are optional**: a payload without them behaves exactly
as before (lead moves to `demo_aron`/`demo_peter`, no booking task). The CRM's
own UI (call modal, `/drive`) always sends them — only human users are required
to give a date.

| field | notes |
|---|---|
| `booking_at` | ISO datetime — when the visit starts. Must not be in the past. |
| `booking_kind` | `multi_unit_demo` \| `single_machine_demo` \| `job` \| `private` — the rung of the booking priority ladder (multi-unit demo > single machine > 1M+ job > 300k+ job > private). The money rungs are derived from the deal value or the lead estimate; the demo rungs cannot be, hence this field |

Rules: the two fields come **as a pair** (one without the other is a `400`),
and only with `outcome: "meeting_booked"`. The booking task is assigned to the
demo host named by `demo_with` (tenant config `settings.demoHosts`), not to the
caller.

```bash
curl -X POST $CRM/api/leads/12/interactions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "outcome": "meeting_booked", "note": "Kedden 10-kor demó", "demo_with": "peter",
        "booking_at": "2026-09-22T08:00:00Z", "booking_kind": "single_machine_demo" }'
# → 201 { "ok": true, "interactionId": 92, "status": "demo_peter", "taskId": null,
#         "bookingTaskId": 41, "bookingConflicts": [] }
```

The response always carries `bookingTaskId` (null when nothing was booked) and
`bookingConflicts`: other bookings of the same host that collide with this one
(overlap, or less than 30 min travel gap). They are **flagged, never
auto-cancelled** — each entry is `{ taskId, title, startsAt, overlapMinutes,
movable }`, where `movable` is `"new"` or `"existing"`: the lower-priority side a
human may move. The booking is written either way.

`script_variant` (optional) records which call-script A/B variant was used. It
must be one of the tenant's keys (`tenants.settings.scriptVariants`, edited at
`/leads/setup`) — an unknown key is a `400`, never a silent write, because the
point of the variant is that its outcomes can be counted. It lands on the
interaction row, so re-wording or deleting a script never rewrites history.

| `outcome` | what happens |
|---|---|
| `no_answer` | stage advances `new → call_1 → call_2 → call_3 → call_3_plus` |
| `wrong_number` | logged only |
| `not_interested`, `disqualified` | **requires `lost_reason`**; lead `outcome = lost`, `lost_reason` = that free text (the outcome key stays on the interaction row); leaves the board |
| `callback_requested` | creates a `call` task due at `callback_at` (assigned to `assigned_to_id`), moves to `recall` |
| `meeting_booked` | moves to `demo_aron` / `demo_peter` per `demo_with` (`aron|peter`); optional `booking_at` + `booking_kind` schedule the demo — see below |

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

## Companies & persons

### `PATCH /api/companies/:id` / `PATCH /api/persons/:id` — write the enrichment dossier

```bash
curl -X PATCH $CRM/api/companies/42 \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "enrichment": {
        "summary": "Fémszerkezet gyártó, 40 fő, 2019 óta ISO 9001.",
        "apropo": ["2024-ben új csarnokot avattak Kecskeméten."],
        "items": [ { "date": "2024", "title": "Új csarnok", "detail": "Kecskeméti telephely bővítés", "source": "linkedin" } ],
        "sources": ["https://linkedin.com/company/..."]
      } }'
# → 200 { "ok": true, "company": { "id": 42, "name": "...", "enrichment": {...},
#          "closeness_score": 61, "enrichment_updated_at": "2026-09-12T10:00:00.000Z" } }
```

Same auth as every other route (`Authorization: Bearer <key>`, tenant from the
key, `404` if the row is soft-deleted or outside the key's tenant). `PATCH
/api/persons/:id` is identical except the response key is `person` and it
carries `first_name`/`last_name` instead of `name`.

`enrichment` is the research skill's dossier — validated against the same
`dossierSchema` on both routes:

| field | cap |
|---|---|
| `summary` | ≤4000 chars |
| `apropo` | ≤3 items, each ≤600 chars — the "apropó" one-liners a caller opens the phone call with |
| `items` | ≤200, each `{ date?≤40, title≤300, detail?≤2000, source?≤200, url?≤600 }` — `url` must be `http(s)`, and `date` is free text (`"2019"`, `"2023 tavasz"`) because dossier lines rarely carry a real date |
| `sources` | ≤50 items, each ≤600 chars |
| `meta` | free-form object, not rendered |

Invalid shape (a cap exceeded, an unknown top-level key, a bad `url`) is a `400
{ error, details }` with the usual flattened Zod errors.

**Replace, not merge.** `enrichment` overwrites the stored dossier whole — the
research skill owns the entire document, so there is no per-field patching.
Sending `"enrichment": null` explicitly clears it. Every write (including a
clearing `null`) stamps `enrichment_updated_at = now()`; callers cannot set that
field themselves.

`closeness_score` is **read-only** — the CRM computes it (`lib/enrichment/closeness.ts`,
a pure function) from **invoice revenue (max 45 pts, threshold table)** plus
**interactions weighted by type and recency (max 55 pts: meeting/site visit 8,
call 5, email 3, else 2; ×1.0 within 30 days, ×0.7 to 90, ×0.4 to a year, ×0.15
older)**, clamped to 0-100. It is recomputed on every interaction write, and
`null` means "never computed yet". Sending it in the body at all (any value,
including `null`) is rejected:

```json
{ "error": "closeness_score is computed by the CRM and cannot be set" }
```

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

> ⚠️ This does **not** return an enrichment dossier or a lead-scoring tier yet.
> `companies.enrichment` / `closeness_score` (see **Companies & persons** above)
> now exist and are writable via `PATCH /api/companies/:id`, but `tier` is still
> a `leads`-only column. This endpoint still returns only the company facts that
> exist right now; wiring the dossier/closeness into this endpoint's response is
> the next step.

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

Content fields (optional, 2026-09-17, trust ladder): `company_id` (the company
this piece is for; verified against the key's tenant, stored as null otherwise)
feeds that company's dossier to the rewrite loop, and `self_score` (0..1) plus
`self_note` record the SUBMITTING AGENT's own confidence in the version. The
score is stored and displayed only: nothing in the pipeline acts on it. Both are
also accepted on `POST /api/content/:id/versions`.

`GET /api/content/queue` returns, per item: `openChecks` (blocking warning
questions and failed rules), `settledChecks` (answers a human gave, usable as
facts), every review with its structured `reason` tag, `currentVersion.selfScore`
/ `selfNote`, and `company` (name, city, `dossier` = companies.enrichment,
`closenessScore`, the verified `contact`). Company facts are READ-ONLY inputs:
the rewrite must never invent or alter one, and an email item with no dossier is
flagged for enrichment instead of rewritten.

A version that breaks a blocking rule (closed claim list, unfilled placeholder,
missing consent footer, oversized body, reused hook, unverified recipient) is
accepted but the item goes to `rewrite_requested` with one open check per
violated rule, so it returns to the AI queue and cannot go live.

Campaign tracking fields (optional, 2026-09-17): `senderUserId` (whose inbox
sends the touch; must be a user of the key's tenant, otherwise stored as `null`),
`wave` (1-52) and `dueAt` (ISO datetime, when the touch is due). Touch 1's
`dueAt` is the wave's send morning. Later touches are rescheduled when the
previous one is marked sent in `/outreach` (cadence day 1/4/8/15 from the real
send of touch 1). Leave a field out to keep its stored value.

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

## Content

The content approval pipeline (spec `docs/specs/2026-09-17-content-approval-design.md`).
App-key auth throughout. **No route here can set a verdict or mark anything
live** — approving/requesting changes/rewrite is a human action taken at
`/content`; only a reviewer's own review write, through the UI, can move an
item to `live`.

Statuses: `draft | in_review | changes_requested | rewrite_requested |
ai_working | live | archived`. Categories: `script | email | ad | lead_magnet |
landing | video | image | other`.

### `POST /api/content` — submit a new item (v1, straight into review)

```bash
curl -X POST $CRM/api/content \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "channel": "blog", "content_type": "email", "title": "…", "body": "…", "purpose": "Q4 cold email, step 1" }'
# → 201 { "ok": true, "contentItemId": 10, "versionId": 20, "status": "in_review" }
```

Creates the item and its version 1 through `lib/content/service.ts` (the one
write path for the pipeline); campaign auto-create and assets are unchanged
from before. New optional fields: `category` (defaults from `content_type`:
`email`→`email`, `video_script`→`video`, else `other`), `format` (≤ 60 chars,
e.g. `plain_text_email`, `9x16_video`), `purpose` (≤ 300), `external_ref`
(≤ 500 — traceback to the source file/row), `change_note` (≤ 4000 — why v1
exists), `import` (boolean — `true` authors the version as `import` instead
of `ai`, for migrating existing material).

Idempotent on `external_ref`: an item with the same ref already existing
returns `200 { "ok": true, "contentItemId", "versionId", "existed": true, "bodyHash" }`
(`bodyHash` is a sha256 of the item's CURRENT version body, so an importer can
tell a changed source file from an unchanged one and post a new version instead
of skipping it: that is what `scripts/import-content.mjs --refresh` does)
and writes **no** new assets, no `content.submitted` app event — the caller
already has an item, nothing is duplicated.

**Warning-marker checks (spec §6c).** On a newly-created item (not `existed`),
the body is scanned for `⚠`/`⚠️` markers via `lib/content/warnings.ts`; each
one becomes a `ContentCheck` (question text, `forWhom: aron|peter|either`,
`source: "import"`) via `addChecks()`, deduped on exact question text. This
runs when `extract_warnings` is `true`, or — if `extract_warnings` is omitted —
when `import` is `true`; a normal AI-authored post (`import` unset) gets no
checks unless it opts in with `extract_warnings: true`. It happens **after**
the create transaction commits, so a checklist failure never loses the item —
it's logged via `reportError` and the response still succeeds. The response
gains `checksCreated` (number, `0` when nothing was extracted or the write
failed). **An item with an `open` check cannot go live** — the checklist is
enforced at the live-transition, not at intake.

### `GET /api/content/queue?status=changes_requested,rewrite_requested`

Items the `content-revise` skill should pick up: current version body, assets,
category/format/purpose, and every reviewer comment across the version
history (so the AI sees why earlier versions failed). `status` is a
comma-separated list validated against the status enum above; an unknown
value is `400`. Defaults to `changes_requested,rewrite_requested`.
`200 { "ok": true, "items": [...] }`.

### `GET /api/content/live?category=&campaign=&format=`

Dual-approved versions only — never a draft (spec §6). `campaign` is the
campaign **slug**. `200 { "ok": true, "items": [...] }`.

### `POST /api/content/:id/claim`

The `content-revise` skill claims an item before rewriting it → `ai_working`.
`id` must be a positive integer or `400`. Idempotent for the same app while
its own claim is fresh; otherwise `409` if the item isn't in a requestable
status (`changes_requested`/`rewrite_requested`) or is already claimed.
**Stale claims are released after 2 hours** — back to the status the claim
was taken from — so a dead/aborted run never wedges an item.
`200 { "ok": true, "alreadyClaimed": boolean }`.

### `POST /api/content/:id/versions`

```bash
curl -X POST $CRM/api/content/5/versions \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "body": "…", "change_note": "addressed Áron'"'"'s CTA comment", "based_on_version_id": 4 }'
# → 201 { "ok": true, "versionId": 9, "number": 2 }
```

Posts the app's rewrite as a new, immutable version. `body` (1-50000),
`change_note` (1-4000, required), `based_on_version_id` (positive int,
required); a Zod failure is `400 { error, details }`. Optional
`needs_human_asset` flags that the change needs an image/video a human must
produce (the skill doesn't regenerate media).

**Race rule (409):** the app must hold a live claim on the item and
`based_on_version_id` must equal the item's current version — if a human
version was created after the claim, or a newer version exists, the post is
rejected with `409` and the app must re-claim and re-read the (now current)
version before retrying. The AI never overwrites a human edit.

**`from_source` (importer only):** the import script sets `"from_source": true`
when the source file behind an item changed and the new version merely restates
it. Such a post needs no claim, because the importer is not the rewrite loop.
Everything else still holds: `based_on_version_id` must be the current version,
the content rules run, reviews reset, and a post is rejected with `409` while
the AI holds a claim (status `ai_working`) so a refresh can never overwrite a
rewrite in flight.

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
