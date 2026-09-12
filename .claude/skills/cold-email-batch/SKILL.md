---
name: cold-email-batch
description: Drafts a batch of cold-outreach emails for a named campaign against a target list of companies, using local dossier data and the CRM's outreach API. Use when Áron says things like "draft cold emails for campaign X", "build the outreach batch for these companies", or hands over an Excel/CSV of targets to email. Never sends anything — it only writes draft rows for a human to approve in `/outreach`.
---

# Cold-email batch drafting

You draft the 4-touch cold-outreach sequence (`docs/cold-email-framework.md`) for a campaign and
post the drafts to the CRM as `draft`-status rows. **You never send an email.** Sending is a human
clicking "Küldés" in the CRM's `/outreach` page — there is no send step in this skill, and no API
call in this skill causes an email to leave anyone's inbox.

## Inputs you need from the operator

- Campaign name (free text, e.g. `gp8800-launch-1`) — used as-is for `campaign` on every call.
- A target list, either:
  - **CRM targets API** — the default. Pulls companies not yet drafted for this campaign.
  - **Excel/CSV** — when the operator hands you a specific file. Read it directly; don't invent
    columns it doesn't have.

## Step 1 — get targets

**Preferred: CRM API.**
```bash
curl "$CRM/api/outreach/targets?campaign=<name>&limit=50" \
  -H "Authorization: Bearer $KEY"
```
Auth is `Authorization: Bearer helm_<key>` (an app key from Settings → API kulcsok — ask the
operator for `$CRM`/`$KEY` as env vars, never hardcode a key). Returns companies with no
`email_drafts` row yet for this campaign, each with `id, name, website, city, county, zipCode,
warmth, teaorCode, teaorDescription, scopeOfActivity, notes, ndtMethods, lat, lng` and up to 3
`contacts` (`personId, name, role, email, phone`). `total_remaining` tells you how many are left
uncalled — page through with `limit`/re-running until it's 0 or you've hit the batch size the
operator asked for.

**Alternative: a supplied Excel/CSV.** Read the file as given. You'll be missing the CRM
`companyId` in this case — you still need it before drafting (step 4 requires `companyId`), so
either cross-reference by company name against a prior `/api/outreach/targets` pull, or ask the
operator how to resolve it. Don't guess an id.

## Step 2 — build a dossier per company

Local sources on this machine (check what's actually there before citing a file):
- `/home/aron166/Projects/zoho_data/Accounts_2026_03_31.csv` (~1,752 rows) — `Account Name`,
  `Website`, `Industry`, `Phone`, `Annual Revenue`, `Last Activity Time`.
- `/home/aron166/Projects/zoho_data/Contacts_2026_03_31.csv` (~2,729 rows) — `Contact Name`,
  `Account Name`, `Email`, `Title`, `Department`, `Phone`. Join to Accounts on `Account Name`.
- `/home/aron166/Projects/zoho_data/Deals_2026_03_31.csv` (~83 rows) — `Deal Name`, `Amount`,
  `Stage`, `Closing Date`, `Account Name`. Join the same way.
- `/home/aron166/Projects/zoho_data/Calls_2026_03_31.csv` and `Visits_2026_03_31.csv` — call/visit
  history, useful for "we last talked to you about X" apropó lines.
- Public web: the company's own site (`website` from the targets API or `Website` from Accounts)
  and a general web/news search for anything recent and specific.

**Do not reference PeterDrive's MCP.** It is not installed on this machine — skip that source
entirely rather than treating it as a step to attempt and fall back from.

Pull 2–3 concrete, true facts per company for the touch-1/touch-2 apropó lines. If you can't find
enough to say something specific and true, say so and either skip the company or flag it for the
operator — a generic line defeats the point of the apropó.

## Step 3 — pre-tier

Read `/home/aron166/Projects/machines/birdsview/27_qualification_model.md` for the tier
definitions (A–E) and apply the same logic to what you know about the company (industry, deal
history, own-device signals in notes/calls) — this is a judgment call, not a form submission.

**Tier is not sent anywhere.** `POST /api/outreach/drafts` has no `tier` field (confirmed against
`docs/api.md` — the draft object is `companyId, campaign, step, subject, body, toEmail,
personId?`, nothing else), and `GET /api/outreach/targets` does not return or accept a tier either
— `docs/api.md` says explicitly that company-level tier/dossier storage
(`companies.enrichment`/`closeness_score`) isn't built yet. Use the tier only to decide drafting
priority/tone (e.g. sharper CTA for a likely tier A) and to sort your own batch order. Leads get
their *own* tier automatically from `POST /api/leads`'s qualification answers later — don't try to
set it here, and don't call a `PATCH /api/companies/:id` or `/api/persons/:id` to store the
dossier/tier — those endpoints are not documented in `docs/api.md` (addendum item 2, not built).

## Step 4 — draft the 4 touches

Follow `docs/cold-email-framework.md` exactly — it has the per-touch structure and is full of
⚠️ PLACEHOLDER markers because Péter's real copy hasn't landed. Fill in the dossier facts from
step 2; leave the ⚠️ placeholder Hungarian sentences as-is (don't paraphrase them into something
that looks final) unless the operator has supplied replacement text.

## Step 5 — post the drafts

```bash
curl -X POST $CRM/api/outreach/drafts \
  -H "Authorization: Bearer $KEY" -H "Content-Type: application/json" \
  -d '{ "drafts": [
    { "companyId": 42, "campaign": "<name>", "step": 1, "subject": "…", "body": "…",
      "toEmail": "info@example.hu", "personId": 7 }
  ] }'
```
Up to 200 items per call. Upserts on `(companyId, campaign, step)`. Read the response:
- `created` / `updated` counts.
- `skipped` — each with a `reason`: `already_sent` (a human already approved/sent/it got a reply —
  never touch it again this run or any future run), `unknown_company` (bad id, cross-tenant),
  `error` (per-item failure). Report skips to the operator, don't retry them blind.

`personId` is optional and is verified server-side against the company's contacts — it's silently
dropped if it doesn't match, so it's safe to include when you have it from step 1's `contacts`.

## When you're done

Tell the operator: how many companies were drafted, how many touches posted, how many were skipped
and why, and which companies you couldn't build a real dossier for. Remind them nothing was sent —
review and approval happens in `/outreach`.
