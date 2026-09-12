---
name: reply-intake
description: Finds Gmail replies to cold-outreach drafts and turns each one into a CRM lead via POST /api/leads, using the thread_key field so re-runs never create duplicates. Use when Áron says things like "check for cold-email replies", "run reply intake for campaign X", or wants this put on a schedule.
---

# Reply intake — cold-email replies → CRM leads

Turns Gmail replies to a cold-outreach campaign into leads in the CRM, via `POST /api/leads` with
`channel: "cold_email"` and `thread_key`.

## Idempotency — how it actually works

`POST /api/leads` accepts `thread_key` (`docs/api.md`, "`thread_key` — cold-email reply intake").
It is the string `threadKeyFor(campaign, companyId)` stamped on the draft when it was sent — from
the documented example (campaign `"BirdsView Q4"`, `thread_key: "birdsview-q4:42"` for company
42), the shape is `<slugified-campaign>:<companyId>`, but that's read off one example, not a
formal spec — if you're unsure of the exact slug, it's safe to guess: get it wrong and the lead is
still created (see below), you just lose the auto-link/auto-flip.

Posting the same `thread_key` twice is safe **on the server side, no local bookkeeping needed**:
- If a lead with that `thread_key` already exists: **nothing is written**, you get back
  `200 { ok, leadId, deduped: true, companyId }` with the *original* lead. No second lead, no
  second intro email, no second automation firing. Run this skill as often as you like.
- The matching draft (the one this `thread_key` names, if it's still `sent`) **flips to
  `replied`** automatically — you don't call anything else for that.
- A `thread_key` that matches no draft is still accepted: the lead is created via the ordinary
  name-dedupe path and the response omits `draftId`. Nothing errors.

So: always send `thread_key` when you can determine it. If you genuinely can't (e.g. you can't
tell which company/campaign a reply belongs to), it's fine to post without it — you just fall back
to the ordinary (non-idempotent) `POST /api/leads` behavior for that one lead, so don't post the
same reply twice by hand.

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

## Step 2 — work out the thread_key and the fields

- `campaign` — the campaign name you're running intake for.
- `companyId` — the company this reply's thread belongs to. Recover it from what you know: the
  dossier/target list `cold-email-batch` built for this campaign (name → companyId), or by
  matching the reply's sender domain/company name against `/api/outreach/targets` for this
  campaign if you still have it, or the zoho `Accounts_2026_03_31.csv`
  (`/home/aron166/Projects/zoho_data/Accounts_2026_03_31.csv`) as a last resort for the name.
- `thread_key` — `<slugified campaign>:<companyId>` per above.
- From the reply body/sender:
  - `contact_name`, `contact_email` (the reply's sender), `contact_phone` (only if it's actually
    in the signature/body — don't guess).
  - `company_name` — required by `POST /api/leads`; if a `thread_key` resolves to a known draft
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
    "thread_key": "<slugified-campaign>:<companyId>"
  }'
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
