---
name: reply-intake
description: Finds Gmail replies to cold-outreach drafts and turns each one into a CRM lead via POST /api/leads, using the thread_key field so re-runs never create duplicates. Use when Áron says things like "check for cold-email replies", "run reply intake for campaign X", or wants this put on a schedule.
---

# Reply intake — cold-email replies → CRM leads

Turns Gmail replies to a cold-outreach campaign into leads in the CRM, via `POST /api/leads` with
`channel: "cold_email"` and `thread_key`.

## The two keys (read this first)

`POST /api/leads` takes **two** keys for a reply, and they are not the same thing
(`docs/api.md` → "`thread_key` + `draft_key` — cold-email reply intake"):

| field | what it is | where you get it |
|---|---|---|
| `thread_key` | the **Gmail thread id** — one real conversation | the thread you are reading |
| `draft_key` | `email_drafts.thread_key` — the outreach we sent, shared by all 4 touches | the draft this reply answers |

`thread_key` is the idempotency key. `draft_key` only tells the CRM which outreach
this answers. They were once one field, and that was a bug: a prospect who said
"not now" to touch 1 and "send the quote" three weeks later had the second reply
silently swallowed as a duplicate, because the shared key made it look like the
same thread.

**Send both.** A `thread_key` is honoured **only** when `channel` is
`"cold_email"` **and** `draft_key` matches a real draft — otherwise it is
dropped and you get an ordinary lead with no idempotency. That gate exists
because this endpoint is CORS-open and draft keys are guessable.

### Re-running is safe

- Same `thread_key` already seen → **`200 { ok, leadId, deduped: true, companyId }`**,
  nothing written: no second lead, no second intro email, no second automation.
  This is a success, not an error — count it as "already processed" and move on.
- Both keys are lowercased server-side, so case variants are the same key.
- Posting a reply also flips the answered draft to `replied` **and cancels the
  still-queued touches** for that company and campaign, so nobody sends cold
  touch 3 to someone who already answered. You do not call anything else.

No local ledger, no bookkeeping of your own. Post every reply you find; the CRM
decides what is new.

## Setup (once)

- `$CRM`, `$KEY` — app-key auth (`Authorization: Bearer helm_<key>`). Ask the operator; never
  hardcode.
- Gmail access via the connected Gmail tools in this environment (search/read threads). No
  separate Gmail API key to manage — it rides on the operator's own Claude subscription
  connection.

## Step 1 — find candidate replies

Search Gmail for replies in the campaign's outreach thread(s): by subject text (the cold-email
subject lines drafted for this campaign) or a specific thread id the operator gives you.
`docs/api.md` has no endpoint that lists sent drafts or their subjects, so the operator needs to
tell you the subject pattern to search, or you're working from your own memory of what
`cold-email-batch` drafted for that campaign.

For each Gmail thread that has a reply (more than just the original outbound message), read the
latest reply: sender name/email, and body text.

## Step 2 — work out the two keys and the fields

- `thread_key` — **the Gmail thread id, verbatim.** Don't construct it, don't slugify anything;
  it is whatever the mail tool calls this conversation. One conversation, one value, forever.
- `campaign` — the campaign name you're running intake for.
- `companyId` — the company this outreach went to. Recover it from the dossier/target list
  `cold-email-batch` built for this campaign (name → companyId), or by matching the sender's
  domain/company name against `/api/outreach/targets` for this campaign if you still have it,
  or the zoho `Accounts_2026_03_31.csv`
  (`/home/aron166/Projects/zoho_data/Accounts_2026_03_31.csv`) as a last resort.
- `draft_key` — `<slugified campaign>:<companyId>`, e.g. `birdsview-q4:42`. Slugify = lowercase,
  every run of non-alphanumerics → `-`.

  ⚠️ **Do not guess the companyId.** A `draft_key` you invent can match a DIFFERENT company's
  outreach, and then the CRM takes the company from *their* draft, attaches this reply to them
  and cancels *their* remaining touches. If you cannot establish the company, omit `draft_key`
  (and with it the idempotency — post once, and tell the operator you did) rather than guess.
- From the reply body/sender:
  - `contact_name`, `contact_email` (the reply's sender), `contact_phone` (only if it's actually
    in the signature/body — don't guess).
  - `company_name` — required by `POST /api/leads`; if a `draft_key` resolves to a known draft
    you likely already know this from the dossier.
  - Intent, read from the reply text, per the addendum's routing:
    - **warm** (wants to talk now, gives availability) → route to a call.
    - **lukewarm** (interested but non-committal) → route to the qualification form link.
    - **"not now"** (polite decline) → route to nurture.
    Not an API field — `docs/api.md` has no intent field on `POST /api/leads`. Put it in `message`
    (quote/summarize the reply plus your read) so a human sees the same read you did, and say it
    out loud in your run summary.

## Step 3 — post the lead

```bash
curl -X POST $CRM/api/leads \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{
    "company_name": "<from reply/dossier>",
    "contact_name": "<from reply>",
    "contact_email": "<from reply>",
    "contact_phone": "<from reply, if present>",
    "message": "<reply text or summary, plus your warm/lukewarm/not-now read>",
    "channel": "cold_email",
    "campaign": "<campaign name>",
    "thread_key": "<gmail thread id>",
    "draft_key": "<campaign slug>:<companyId>"
  }'
# new reply   → 201 { "ok": true, "leadId": …, "tier": …, "companyId": …, "personId": …, "draftId": 5 }
# seen before → 200 { "ok": true, "leadId": …, "deduped": true, "companyId": … }
```
Check the response:
- `201 { leadId, tier, companyId, personId, draftId }` — new lead, draft (if `draftId` present)
  flipped to `replied`.
- `200 { deduped: true, leadId, companyId }` — already processed on a prior run. Nothing to do,
  just note it in your summary; this is the normal "the schedule caught this reply again" case,
  not an error.

## Scheduling

This skill has no daemon of its own — run it on a timer with whatever scheduler you already have:
- A `cron` entry invoking `claude -p "/reply-intake <campaign>"` (headless, non-interactive) every
  N minutes.
- Or the `loop` skill (`/loop 15m /reply-intake <campaign>`) for an interactive recurring run.

Because dedupe is server-side on `thread_key`, re-running on a schedule against the same replies
is exactly what it's designed for — no separate "have I seen this before" tracking needed.

## When you're done

Report to the operator: how many replies found, how many new leads created (with ids and their
`draftId` if the auto-flip fired), how many were `deduped` (already processed), how many you
couldn't post and why (usually an unresolved `company_name`/`companyId`), and the
warm/lukewarm/not-now read for each new lead.
