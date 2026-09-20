# Campaign key FK promotion (not done yet)

Status: deferred, 2026-09-20. This is a spec for a migration we chose not to
run, not a plan we are executing this week.

## Why deferred

`email_drafts.campaign`, `leads.campaign`, `interactions.campaign` and
`content_items.outreach_campaign` are free strings, not a `campaign_id` FK.
Promoting them is a 4-table data migration, and it landed two days before the
first real cold-email wave goes out. That is the wrong week to touch the
columns a live send depends on.

Two things make the string load-bearing, not incidental:

- Reply intake matches an inbound email back to its draft by `threadKeyFor(campaign, companyId)`,
  a slug of the string. Get the migration wrong and a reply stops finding its
  thread.
- `EmailDraft.@@unique([tenantId, companyId, campaign, step])` is what stops a
  re-run of the drafting skill from queueing a duplicate touch. Any FK
  replacement has to preserve exactly that identity.

Neither is worth risking days before send. `campaigns.slug` already IS the
outreach key by convention (2026-09-20 decision); that gets us one identity
without touching the string columns at all.

## What exists in prod today

- 1 `campaigns` row: `birdsview_q3`.
- 8 `email_drafts` rows, all `campaign = 'TESZT'`, all `status = 'draft'`, none
  sent.
- 0 rows in `leads.campaign`, `interactions.campaign`, `content_items.outreach_campaign`.

So the data cost of migrating is close to zero: `TESZT` isn't even a real
campaign, nothing has sent, nothing else uses the column yet. The real cost is
the code surface listed below, not the rows.

## Ordered steps

1. **Backfill rows for orphan keys.** Every distinct string value with no
   matching `campaigns.slug` (today, just `TESZT`) gets a real `campaigns` row
   created for it. Rollback: delete the created rows, nothing else changed yet.
2. **Add nullable `campaign_id`** to all four tables, FK to `campaigns.id`,
   `ON DELETE RESTRICT` on `email_drafts` (a nulled campaign_id would break the
   touch-identity key in step 6) and `ON DELETE SET NULL` on the other three.
   Additive, no reads change. Rollback: drop the column.
3. **Dual-write.** Every write path that sets the string also resolves and
   sets `campaign_id` (via `campaignBySlug`-style lookup, creating a row if
   the slug is new). Rollback: revert the dual-write commit; `campaign_id`
   stays nullable and unused.
4. **Backfill `campaign_id`** on existing rows from the string, one UPDATE per
   table. Rollback: null the column back out.
5. **Swap reads** from the string to the relation across the call sites below.
   Rollback: revert the read-swap commit; the string is still there and still
   correct because of step 3.
6. **Drop the string, and in the same migration replace `@@unique([tenantId, companyId, campaign, step])`
   with `@@unique([tenantId, companyId, campaignId, step])`.** These two must
   land together. Dropping the string first, or replacing the unique key in a
   later migration, opens a window where nothing stops a duplicate touch.
   Rollback point: none, past here. Re-add the string column and backfill it
   from `campaign_id` if this has to be undone.

## Call sites that would change

Found by grepping `web/src` for the string columns (not `campaignId`, which
already exists as a real FK on `ContentItem` and is unaffected):

- `web/src/app/actions/campaigns.ts`: slug/campaign key generation
- `web/src/app/actions/outreach-campaigns.ts`: drafting, send, reply-matching, template gate
- `web/src/app/actions/email-drafts.ts`: draft queue, gating, thread key
- `web/src/app/actions/leads.ts`: lead campaign tag read/write
- `web/src/app/actions/calls.ts`: campaign carried onto call-derived interactions
- `web/src/app/actions/content.ts`: distinct campaign list for the content UI
- `web/src/app/api/outreach/targets/route.ts`: campaign key in the targets query
- `web/src/app/api/outreach/drafts/route.ts`: upsert key, registry lookup
- `web/src/app/api/leads/route.ts`: inbound lead campaign tag
- `web/src/app/api/calls/pending/route.ts`, `web/src/app/api/calls/result/route.ts`
- `web/src/lib/outreach/schedule.ts`: next-touch scheduling, keyed on campaign+step
- `web/src/lib/outreach/drafts.ts`: `threadKeyFor`
- `web/src/lib/leads/ingest.ts`, `web/src/lib/leads/service.ts`
- `web/src/lib/content/queries.ts`: live library campaign display
- UI: `LeadEditModal.tsx`, `LeadDetailClient.tsx`, `OutreachQueue.tsx`,
  `CampaignDashboard.tsx`, `InboxClient.tsx`, `LibraryClient.tsx`, `ReviewClient.tsx`

Each of these currently reads or writes a plain string; after the swap they
resolve or filter on `campaignId` instead. `scripts/import-cold-email-v0.mjs`
also writes the string directly and would need the same treatment.
