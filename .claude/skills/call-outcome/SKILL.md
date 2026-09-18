---
name: call-outcome
description: Parse a setter's dictated call transcript into a structured outcome — pulls pending transcripts from the Helm CRM, reads each one, and posts back an outcome/confidence/note reading. Use when asked to "work the call queue", "parse pending calls", "read the call transcripts", or on the scheduled call-outcome routine.
---

# call-outcome

The CRM (`ndt-crm`) records what a setter dictates after a phone call as a raw
transcript. **You** turn that transcript into a structured outcome. You never
book, send, or close anything — the CRM decides whether your reading is safe
enough to apply on its own; everything else becomes a task for a human. The
CRM does not call an LLM — you are the parse, running on the Claude
subscription, never with an Anthropic API key.

## Setup

- `CRM_URL` — e.g. `https://ndt-crm.vercel.app` (prod) or a local mock.
- `CRM_APP_KEY` — an app key minted in CRM Settings → API kulcsok (slug e.g.
  `call-outcome`). Never print it. Every request:
  `Authorization: Bearer $CRM_APP_KEY`.
- If either is missing, stop and say so. Do not guess a URL.

## The loop

### 1. Pull the queue
```bash
curl -s "$CRM_URL/api/calls/pending?limit=20" \
  -H "Authorization: Bearer $CRM_APP_KEY"
```
Each row: `id, lead_id, company_id, company_name, person_name, occurred_at,
transcript, lead_status, campaign`.

Empty queue → print "Nothing to parse." and stop.

Never call any endpoint other than `GET /api/calls/pending` and
`POST /api/calls/result`. There is no route to book, send, close, or edit a
lead directly — if you ever find one, do not use it.

### 2. For each row, read the transcript and build the `parsed` object

Choose **exactly one** outcome slug:

| slug | Hungarian label | meaning |
|---|---|---|
| `no_answer` | Nem vette fel | the person did not pick up |
| `wrong_number` | Rossz szám | the number does not reach the intended person/company |
| `not_interested` | Nem érdekli | explicitly declined, no further interest |
| `disqualified` | Diszkvalifikált | not a fit (wrong scope, wrong size, etc.), closed as lost |
| `callback_requested` | Visszahívást kért | asked to be called back at a later time |
| `meeting_booked` | Foglalt meeting | agreed to a demo/site visit |

If the transcript names no clear outcome, pick the closest read and drop
`confidence` accordingly rather than guessing a different slug.

**`note` (Hungarian, magázás — Ön/Önök, 3rd-person verbs):**
- Write only what the transcript actually says. Never infer a reason nobody
  spoke. This note is what a human reads **instead of** the transcript — treat
  it as the record, not a summary of your impression.
- Keep it short and factual: what happened, what was said, what's next if
  anything.

**`confidence` (0..1, your own):**
- This scores your READING of the transcript, not how the call went for the
  setter. A perfectly clear "nem érdekli, ne keressük" is high confidence even
  though the outcome is bad news.
- Under-reporting costs a human 10 seconds (an easy confirm-task). Over-reporting
  costs a wrong lead state written automatically. When in doubt, score low.
- Score low when the transcript is short, noisy, half-heard/garbled, or does
  not clearly name an outcome. Do not round up to look decisive.
- The CRM only ever auto-applies `no_answer`, `wrong_number`,
  `callback_requested` — and only at confidence ≥ 0.8. `meeting_booked`,
  `not_interested`, `disqualified` are never auto-applied, at any confidence,
  because they book or close something. That's deliberate: report your honest
  number regardless of which outcome you picked.

**`answers` (qualification, optional, only real answers):**
- Include a slug only when the transcript contains an actual answer to that
  question — never infer one from tone or silence.
- Use the tenant's existing qualification slugs. The known default set is
  `gate, situation, concrete, goal, size, postcode, timing, own_device` (task
  branch) and `hook, use_case, work` (curious branch) — see
  `web/src/lib/leads/qualification.ts` for what each means. A tenant may have
  renamed or replaced this list at `/leads/setup`; this skill has no endpoint
  to read the live list (see Setup — only `pending` and `result` are allowed),
  so if you are not confident a slug is still the tenant's current one, omit
  it. A wrong answer moves the lead's A-E tier — omitting beats guessing.

**`callback_at` (only for `callback_requested`):**
- Full ISO datetime, Europe/Budapest, resolved from `occurred_at` (e.g. "kedden
  10-kor" relative to the call date).
- Never a date in the past.
- If the caller said only a vague time ("jövő héten", "majd") with no
  resolvable day, omit `callback_at` and lower `confidence` — do not guess a
  day.

**Never included:** you do not book (`booking_at`/`demo_with` are read-only in
the schema for a `meeting_booked` suggestion) and you do not draft `lost_reason`
beyond what was said. The CRM will refuse to auto-apply a booking or a lost
outcome no matter how confident you are — that boundary is deliberate: those
are human acts.

### 3. Post the result
```bash
curl -s -X POST "$CRM_URL/api/calls/result" \
  -H "Authorization: Bearer $CRM_APP_KEY" -H "Content-Type: application/json" \
  -d @result.json
```
with `{ "lead_id", "call_id", "pending_interaction_id", "transcript", "parsed": {
"outcome", "confidence", "note", "answers"?, "callback_at"?, "demo_with"?,
"booking_at"?, "lost_reason"? } }`. Build the JSON with a tool (`jq` or a
script), never by hand-escaping.

`call_id` is the idempotency key and it MUST be derived from the row, not
invented: use `pending:<id>` where `<id>` is the pending row's `id`. A random
or per-run id would let a second run write the same call twice.

- `{ ok: true, applied: true, ... }` → the CRM auto-applied your reading.
- `{ ok: true, applied: false, reason, ... }` → left for a human (confirm-outcome
  task). `reason` is one of `low_confidence`, `human_act`, `incomplete`.
- `{ deduped: true }` → already processed. Skip it, don't retry.
- Two consecutive 5xx → stop the run and report it.
- `400` → fix the payload once; if it fails again, skip and record the error.

### 4. Summary
Print, in English:
```
call-outcome — <timestamp>
Parsed (N): #<call_id> lead <lead_id> — <outcome> (conf <x.xx>)
  Applied (a): #<call_id> — <outcome>
  Left for human (h): #<call_id> — <outcome>, reason: <low_confidence|human_act|incomplete>
  Skipped (s): #<call_id> — <deduped | 400 error | ...>
```

## Rules that never bend
- Only `GET /api/calls/pending` and `POST /api/calls/result`. Nothing else.
- Never book, send, or close anything yourself — you only propose a reading.
- Never invent a reason, a date, or a qualification answer the transcript
  doesn't support.
- Never print `CRM_APP_KEY`.
- If the CRM returns 5xx twice in a row, stop the run and report it.

## Scheduled routine
This skill is also run as a cloud routine (set up by Kai/Áron, not by Nate).
The routine prompt is in `docs/skills/call-outcome-routine.md`.
