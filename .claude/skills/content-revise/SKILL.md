---
name: content-revise
description: Rewrite the CRM content approval queue — pulls every item Áron or Péter sent back ("Javítást kérek" / "Írja újra") from the Helm CRM, claims it, rewrites it against their comments, and posts a new version with a point-by-point change note. Use when asked to "revise the content queue", "work the content queue", "rewrite the rejected copy", or on the scheduled content-revise routine.
---

# content-revise

The CRM (`ndt-crm`) is the source of truth for copy, scripts, ads, lead magnets and
video/image briefs. Two humans review every version. When one of them asks for changes
(✏️) or a rewrite (♻️), **you** produce the next version. You never approve anything,
never publish, and never overwrite a human edit. The CRM does not call an LLM — you are
the rewrite loop, running on the Claude subscription.

## Setup

- `CRM_URL` — e.g. `https://ndt-crm.vercel.app` (prod) or a local mock.
- `CRM_APP_KEY` — an app key minted in CRM Settings → API kulcsok (slug e.g. `content-revise`).
  Never print it. Every request: `Authorization: Bearer $CRM_APP_KEY`.
- If either is missing, stop and say so. Do not guess a URL.

## The loop

### 1. Pull the queue
```bash
curl -s "$CRM_URL/api/content/queue?status=changes_requested,rewrite_requested" \
  -H "Authorization: Bearer $CRM_APP_KEY"
```
Each item carries `status`, `category`, `format`, `purpose`, `campaign`, `currentVersion`
(`id`, `number`, `body`, `changeNote`), `assets` (metadata only), `versions` (history with
change notes) and `reviews` — **every** comment on **every** version, newest first. Read
all of them: earlier comments explain why earlier versions failed, and a rewrite must not
reintroduce something a reviewer already rejected.

Empty queue → print "Nothing to revise." and stop.

### 1b. Read the context before you write
The queue entry carries, when the CRM knows them:
- `reviewReason` per comment — the reviewer's structured tag (e.g. `wording`,
  `translated`, `fact_wrong`, `claim_not_allowed`, `wrong_contact`, `too_long`,
  `wrong_ask`, `wrong_format`, `other`). The tag says WHAT KIND of problem it is; the
  comment says the specifics. Answer both.
- `openChecks` — blocking questions: imported warning markers AND failed machine rules
  (each rule check's question starts with "Szabály:"). Every one of them must be gone from
  your new version; the item cannot go live while any is open.
- `settledChecks` — questions a human already answered. Those answers are FACTS you may
  use. Never invent an answer to something still open.
- machine checks that already failed (forbidden claim, unfilled
  placeholder, missing footer, too long, reused hook …). Every one of them must be gone
  from your new version. They are blocking: an item with an open one cannot go live.
- `company` — the CRM dossier (`companies.enrichment`), the closeness score, the city and
  the verified contact. **These are read-only facts.** Use them for the hook and the
  personalisation; never invent, "improve" or round a fact, and never contradict the
  dossier. Say in the change note which dossier facts you used.
- `externalRef` — the source draft's path, so you can read the original and the
  approver notes around it.

**No dossier, no rewrite (email items):** if an email item's company has no dossier,
post nothing for it, and report it as `needs enrichment` in the summary. The dossier is
produced by the enrichment skill; the two are one pipeline, so the fix is to enrich the
company, not to guess here.

### 2. For each item, in order
1. **Claim it** — `POST $CRM_URL/api/content/{id}/claim`.
   - `200` → continue. (`alreadyClaimed: true` means you claimed it earlier in this run.)
   - `409` → someone else has it, or it is no longer requestable → **skip** (record why).
   - `429` → rate limited: wait 60 s once, retry; if it happens again, stop the run and report it.
2. **Build the brief** from the reviews on the current version (`versionNumber ===
   currentVersion.number`). List each comment point as a separate numbered point. If a
   comment has several requests, split them.
3. **Write the new body.**
   - `rewrite_requested` → write from scratch, following the comments as the brief. Keep
     the item's category/format/purpose.
   - `changes_requested` → the **minimal** edit that addresses exactly the comment points.
     Everything the reviewers did not ask to change stays word-for-word.
   - The body is markdown; keep the structure the item already uses (e.g. `**Tárgy:**`
     lines in emails).
4. **Hungarian text — mandatory rules** (almost everything in this queue is Hungarian):
   - Invoke the `translating-english-to-hungarian` skill **before** writing or editing any
     Hungarian sentence, and write natural Hungarian (no calques).
   - Business register: **magázás** (Ön/Önök, 3rd-person verbs) unless the item says otherwise.
   - Hungarian typography: „ ” quotes, decimal comma, `2026. szeptember 22.` dates.
   - **Claims: closed list — no list, no rewrite.** If the claim list below cannot be read
     (file missing, no access), do **not** write or post anything for any item: stop the run
     and report "claim list unavailable". Before writing, read the claim
     list in `docs/cold-email-framework.md` (in THIS repo, merged 2026-09-17; the
     original lives in growth/campaigns/cold-email-v0/FRAMEWORK.md §6). Only the claims listed
     there may appear. Never add a claim, a number, a price, a reference customer, a depth,
     a tolerance, or "röntgen". If a reviewer asks for something that would need a claim
     outside the list, do **not** invent it — write the version without it and say so in the
     change note ("kérdés Áronnak/Péternek: …").
   - Never add placeholders you cannot fill; keep existing ones (e.g. `<LANDING_URL>`) as they are.
5. **Images and videos** (`category` `image`/`video`, or a comment that asks for a new
   visual): you do not generate media. Post a version whose body is the updated brief for the
   human/agent who will produce it, set `needs_human_asset: true`, and say exactly what must be
   produced in the change note.
6. **Write the change note and your own verdict** (Hungarian, plain text): one line per comment point —
   `1. <the request, briefly> → <what you changed>` — then anything you deliberately did not do
   and why. Every comment point must be answered. Start with `v{new} a v{current} alapján.`
7. **Post the version** —
   ```bash
   curl -s -X POST "$CRM_URL/api/content/{id}/versions" \
     -H "Authorization: Bearer $CRM_APP_KEY" -H "Content-Type: application/json" \
     -d @version.json
   ```
   with `{ "body": "...", "change_note": "...", "based_on_version_id": <currentVersion.id>,
   "needs_human_asset": false, "self_score": 0.0-1.0, "self_note": "..." }`
   — `self_score` is YOUR OWN confidence that this version is ready for a human, and
   `self_note` one line on what you were unsure about. Be honest: a low score gets your work
   sampled, not punished, and the score is only recorded and displayed, nothing acts on it (build the JSON with a tool like `jq` or a script — never by
   hand-escaping).
   - `201` → done.
   - `409` → **a human edited the item after your claim** (or your claim expired). Their version
     wins. Do **not** retry, do not re-claim, do not post again. Record it as skipped.
   - `400` → fix the payload once; if it fails again, skip and record the error.
8. Never call any other endpoint. There is no route to approve, publish or delete — and if you
   ever find one, do not use it.

### 3. Summary
Print, in English:
```
content-revise — <timestamp>
Revised (N): #<id> <title> — v<old> → v<new> (<changes|rewrite>)[, needs human asset]
Skipped (M): #<id> <title> — <409 claimed elsewhere | 409 human edited | 400 … | …>
Questions for reviewers: <any claim/facts you could not add>
```

## Rules that never bend
- One item at a time: claim → write → post. Don't claim items you won't finish in this run
  (a claim you abandon blocks the item for 2 hours).
- `based_on_version_id` is always the `currentVersion.id` from the queue entry you claimed; if
  anything changed in between, the CRM answers 409 and you skip the item.
- Never modify, re-post or "fix" a version written by a human.
- Never put secrets, API keys or internal notes into a body.
- If the CRM returns 5xx twice in a row, stop the run and report it.

## Scheduled routine
This skill is also run as a cloud routine (set up by Kai/Áron, not by you). The routine
prompt is in `docs/skills/content-revise-routine.md`.
