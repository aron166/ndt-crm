# Prospects and campaigns: proposal (2026-11-11)

Task owner: Kai (CTO), written by Nate. Status: PROPOSAL, docs only, nothing built. Áron decides on the picks and
mockups (section 6); every Hungarian string below is PROPOSAL copy.

Áron's model, in his words reduced to rules:

1. A PROSPECT is a firm we know of and have not reached for this offer. A prospect is not a lead.
2. A CAMPAIGN (phone or e-mail) is launched on an audience: prospects, or leads in given stages.
3. A touch that reaches someone turns a prospect into a lead, in the right stage. "No answer" does not.
4. Nurture and retargeting are campaigns aimed at leads.
5. Standing order (2026-11-03, repeated today): e-mail first, then calls to the replies AND to the no-replies.

Every premise below was checked against the code on `dev` @ `23e9168` and the production database (read only,
2026-11-11 13:45).

## Where the brief is wrong or incomplete

- "1,745 companies, most bare Zoho-seed records with no lead": the no-lead part is right (1,742 of 1,745 have no
  lead; prod has 3 leads). "Bare" is not: 584 have a contact, 263 have logged interactions, and the **prospect
  concept is already stored**: `companies.account_type = 'Prospect'` on 1,450 rows, and the old Zoho funnel
  `companies.pipeline_status` (0 KUKA, 1 Nem hívtuk, 2 NV, 3 Érdeklődő, 4 Nem érdekelt, 5 Kéri, 6 Folyamatban,
  7 CL, 8 CW) on 244 rows. 1,491 rows have no funnel status at all.
- A **`campaigns` table already exists** (1 row, `birdsview_q3`, audience = saved view "Construction"). Its `slug`
  is already the shared key in `leads.campaign`, `email_drafts.campaign` and `interactions.campaign`. The brief
  does not mention it; it is the natural home for this model.
- **Hívás mód (`/calls`) is already a prospect phone tool**: company level, filtered by a saved company segment,
  one tap logs an append-only interaction on the company, moves `pipeline_status`, and offers a follow-up task. It
  creates no lead and pushes no task to anyone. Missing: a campaign tag on its calls, a daily cap, a promotion to
  a lead. It also only shows companies with `pipeline_status` in 1, 2, 3, 5, 6 (184 companies today).
- "Trip campaigns and route-aware booking (W8b)": only the booking half is built (W8b slice 1: `lib/booking/`
  feasibility, bundles, ranked route slots; the "Foglalt utak" aside on the hívólista). Trip campaigns are plan
  text only (W8b plan section 3): no trip entity, no trip batch, no approval card.
- "Nurture sequences in #165": #165 is not merged. It is the right shape for nurture (sequences as data, sending
  gated) but nothing of it is live.
- The launch list is not all "never contacted": 229 of its 485 rows are Péter's warm network and 200 rows match a
  CRM Customer. They are prospects **for this offer** (no open lead), not strangers. So the working definition is
  "a company with no open lead", not "a company we never spoke to".
- The lead-import flood is confirmed and worse than one task: `startLeadLifecycle` runs for every channel,
  `import` included, so each imported lead gets owner Péter, an "Első hívás (SLA)" call task due within one
  working hour, and the daily sweep files an SLA escalation to Áron for each one not called. The current dry run is
  220 payloads (the #186 PR body said 122; the list was rebuilt since).

## a. What already exists that is this, under other names

| Concept | Where it lives | How far it goes |
|---|---|---|
| Prospect | `companies` with no open lead; `account_type = 'Prospect'` (1,450); Zoho funnel `pipeline_status`; `warmth` | Stored and filterable in Cégek (account type, warmth, pipeline status, tags, county). No per-campaign state |
| Campaign record | `campaigns` (slug, name, project, `audience_view_id` = saved company segment, `sender_user_id`, `current_wave`) | Names the marketing content queue and the cold-email batch. No channel, status, cap, dates, approval or members |
| Campaign tag on records | `leads.campaign`, `leads.custom_fields.utm_*`, `email_drafts.campaign`, `interactions.campaign` (free strings = slug) | Stamped on lead-linked writes; reports can count by it. FK promotion specced only (`docs/specs/campaign-key-fk-promotion.md`) |
| Phone campaign on prospects | Hívás mód `/calls` (`actions/outreach.ts` `getCallQueue`, `recordCall`; `lib/outreach/queue.ts` outcomes) | Works today on a saved segment, 60 rows, least recently touched first. No cap, no campaign tag, no lead on success |
| Phone list on leads | hívólista, `/leads?view=queue` (`leads/queue/queue-data.ts`), call-outcome modal, `POST /api/leads/:id/interactions` | Live. Driven by lead `next_due` and SLA tasks |
| E-mail campaign on prospects | Outreach: `email_drafts` (4-touch sequence per company, waves, `due_at`, manual or Resend send, `replied_at`), `/outreach`, `/outreach/campaigns` dashboard | Drafts exist (38 for `corvid-betonscan-w1`, 8 `TESZT`), all `draft`. Send refuses without `outreachFooter`; Resend domain not verified |
| Reply turns prospect into lead | `POST /api/leads` with `channel: cold_email` + `thread_key` (idempotent per thread) | Contract built; nothing drains real replies yet |
| Do not contact | `suppressions` (address or domain), checked by every outreach picker and every send | Live, 1 row |
| Nurture on leads | #165 W9 nurture sequences (enrolment by intent, pause on reply or call, one mail per 6 days, Áron approves templates) | Not merged; sending off (`nurture_enabled`) |
| Approval before anything leaves | Content approval pipeline (`content_items`, versions, checks, reviews, Döntések); outreach draft `approved` status | Live for content; outreach send gate live |
| Rules that react | `automation_rules` (lead_created, lead_status_changed, deal stage, idle; create_task, send_email, assign, webhook) | Live; fires on every lead created, import included |
| Trip-aware targeting | W8b route slots (built), trip campaigns (plan only) | Booking proposer live; trips and trip batches not built |

So the CRM has the pieces of a campaign in three places (marketing `campaigns`, outreach drafts, Hívás mód) and no
object that ties audience, channel, cap, approval and outcome together. That object is what this proposal adds.

## b. The smallest model

### Where a prospect lives

| Option | For | Against |
|---|---|---|
| **A. A company with no open lead, plus a campaign membership row** (recommended) | No new entity: the 1,745 companies, Cégek filters, company dedupe (VAT, name) and Hívás mód all apply as they are. Promotion is "create a lead on this company", the path the CRM already has | "Prospect" is derived, not a column. Per-campaign state (attempts, step) lives on the membership row, so one company in two campaigns has two rows |
| B. A separate prospect list entity | Clean wall: an import can never touch real companies | A second company store: dedupe twice, merge on promotion, two places to look. Breaks the one-ledger rule of the hub |
| C. A lead in a pre-stage ("prospect" column on the board) | One table, the board shows it | Áron said prospects are not leads. Every lead path (SLA lifecycle, `lead_created` automations, nurture enrolment, counts, reports) needs an exception; 481 cards on Leadek |

Recommendation: **A**. A prospect is a company with no open lead. Its state in a campaign is a `campaign_members`
row. Leadek does not change.

### What a campaign is

The existing `campaigns` row, extended (additive columns), plus one new table of members.

| Part | Definition |
|---|---|
| Audience | A recipe, then a snapshot. Recipe = one of: an import batch (the launch list), a saved company segment (exists), or a lead filter (stages, outcome, lost reason, age). At approval the recipe is resolved into `campaign_members` rows: the approved list is exact, as in the W8b rule "an edited batch needs a new approval" |
| Channel | `phone`, `email`, or `email_then_phone` |
| Sequence | At most two steps for now: e-mail touch, then a call step N working days later for the members who did not reply |
| Owner | The user who calls (Péter) or sends (Áron or Péter mailbox) |
| Start and stop | `starts_on`, `ends_on`; status `draft`, `approved`, `running`, `paused`, `stopped`, `done` |
| Approval | Áron's user only (same guard as #165 templates, `demoHosts.aron`). Approval stores a hash of member ids, steps, cap and template version; any change after that returns the campaign to `draft` |
| Daily cap | Calls per day per campaign (proposal: 15). Computed on read: today's list = queued members whose `next_eligible_on` is today or earlier, ordered by tier then city, limited to cap minus members already touched today. No cron, no tasks created in advance |

Why the cap holds: members never create tasks. A member reaches Péter only as a row in today's capped list. A
task or a lead appears only after a call or a reply actually happened. 481 members loaded = 15 rows tomorrow, not
220 SLA tasks.

### The promotion rule

| Touch outcome (existing Hívás mód keys) | Prospect side | Lead side |
|---|---|---|
| Nem vették fel (`no_answer`) | Stays a prospect. Attempts + 1, back in the list after 2 working days; after 3 attempts the member is `unreachable` | No lead |
| Rossz szám (`bad_number`) | Member `excluded`, reason bad number; company funnel 0 as today | No lead |
| Nem érdekli (`not_interested`) | Member `declined`; company funnel 4 as today. "Ne hívjon többet" adds a suppression | No lead |
| Csak jegyzet (`note_only`) | No state change | No lead |
| Érdeklődik (`interested`) | Member `promoted` | New lead, stage `contacting` (Hívás alatt), owner Péter, next action = the follow-up the caller set. **No SLA task**: the first call already happened |
| Kéri / akarja (`wants`) | Member `promoted` | New lead, stage `qualified` (Minősítve); if a slot was booked in the call, `demo_booked` |
| E-mail reply, positive | Member `promoted` | New lead via the existing reply intake (`channel: cold_email`, `thread_key`), stage `new` **with** the SLA call task: the replier gets a call within the hour |
| E-mail reply, negative or unsubscribe | Member `declined`, suppression written | No lead |
| No reply after N working days | Member moves to the call step and enters the capped call list | No lead |

Every promotion stamps `leads.campaign = <slug>` and the interaction's `campaign`, so the campaign's results count
without a join table.

### "E-mail first, then call the replies and the no-replies" as one campaign

One campaign, channel `email_then_phone`, two steps:

1. Step 1, e-mail: one outreach draft (touch 1) per member with an e-mail address, through the existing approval and
   send gate (manual send from the mailbox works today; Resend once the domain is verified). Members without an
   e-mail skip straight to step 2.
2. Replies are promoted by the reply intake and land on Leadek with the SLA call: "call the replies".
3. Step 2, call: members with no reply after 3 working days (proposal) enter the capped call list in Hívás mód:
   "call the no-replies". The caller sees that the e-mail went out and when.

### Nurture and retargeting are the same thing aimed at leads

A campaign whose audience is a lead filter: for example lost with reason "timing" more than 60 days ago, or
`recall` with a date in the next 30 days. Members carry `lead_id`; a call outcome on a lead member runs the
existing `logLeadCallOutcome` (stage moves, tasks, lost), so nothing new decides lead stages. #165 nurture is this
with automatic enrolment and e-mail only; it keeps its own tables and is listed on the campaign page read only. One
merge later, if ever.

### Who does what

| Who | What |
|---|---|
| Péter, each morning | Hívás mód: one tab per running phone campaign, "ma 15", grouped by city (Budapest by district, from the postcode), each row with the why line, the contact, attempts and the last touch. His Leadek hívólista is unchanged; promoted leads arrive there with their next step |
| Áron | Approves each launch (exact member list, steps, cap, template version), any edit after approval, raising a cap, and the e-mail templates (existing content approval) |
| An agent, alone | Builds a campaign draft (audience recipe, dedupe, dry run), prepares e-mail drafts in `draft`, logs call outcomes from transcripts (existing auto-outcome with confidence), pauses a campaign on a bounce or suppression hit. Never approves, launches, raises a cap, sends, or imports without a human `--apply` |

## c. Loading the 485-firm launch list as prospects

Source: `workspace/labs/launch-list/` (`build.py`, `out/stats.md`, `IMPORT.md`). Contact data stays in its
gitignored `data/`; nothing of it enters this repo.

What the list holds (counts only): 485 rows; 239 match a CRM company (200 Customer, 35 Prospect, 4 in play); 221
have a phone or an e-mail (155 phone, 180 e-mail); 261 have neither. Budapest: 147 rows, 76 contactable, 53 with
a phone (23 Péter's, 17 for Áron's e-mail lane, 13 nurture lane).

Load path (replaces the lead import in `IMPORT.md`; no lead is created):

1. Áron approves the campaign draft "Budapest indulás" (or one campaign per lane; decision 5).
2. `build.py --campaign-members` writes the members payload: per row the CRM company id when matched, else name,
   VAT, city, website; person name, role, phone, e-mail; tier, lane, owner, why, trip city.
3. `POST /api/campaigns/<slug>/members` with `dry_run: true` returns the plan: matched, created, skipped and why.
   Dedupe, in this order: the builder's `crm_company_id`, then VAT, then exact name (the existing import index
   `matchCompany`). A company with an open lead is not a prospect: skipped as "open lead" (the 4 "in play" rows).
   Suppressed addresses and domains: skipped. The 66 possible-duplicate pairs are not merged (left to a human, as
   the builder already does). Persons dedupe by e-mail, as the person import does.
4. Same call with `dry_run: false` (Áron's yes). One `import_batch` id per call; the response is the receipt.
   Existing companies are not edited: no `pipeline_status`, `account_type` or notes change.
5. Rows with no contact load as members in state `needs_contact`: they never enter a call list until enrichment
   adds a phone or e-mail (decision 6).
6. Release: the daily cap does it (section b). Loading all of them at once is safe.
7. Undo: `DELETE /api/campaigns/<slug>/members?batch=<id>` removes the members never touched and soft-deletes the
   companies and persons that batch created, if nothing else points at them yet. Touched members stay: their
   interactions are append-only.

## d. UI options (Astryx tokens and primitives, one accent, one primary action per page)

Constraint from Áron: a redesign is not a rename. Leadek stays the leads page, Hívás mód stays the call mode,
Outreach stays. No new concept gets an existing page's name.

### Option 1 (recommended): campaigns under Outreach, the morning list in Hívás mód

Nav unchanged. Outreach gets a Kampányok tab (the existing `/outreach/campaigns` page grows into it). Hívás mód
gets one tab per running phone campaign next to the saved segments it has today. Leadek only gains a small
campaign chip on cards that came from a campaign. Prospects are visible in Cégek (filter "Prospect, nincs nyitott
lead") and per campaign on the campaign page.

Campaign launch screen (`/outreach/campaigns/<slug>`):

```
 Outreach  >  Kampányok  >  Budapest indulás                        Piszkozat
 ---------------------------------------------------------------------------------
 Célközönség                                   | Lépések
   Launch list, Budapest                       |   1  E-mail, 1. érintés     sablon v3, jóváhagyva
   147 cég   76 elérhető   71 elérhetetlen     |   2  Hívás, 3 munkanap után  akik nem válaszoltak
   Kihagyva: 4 nyitott lead, 1 tiltólistás     |
   [ Lista megnyitása ]                        | Napi keret
                                               |   15 hívás / nap   Péter
 Időszak                                       |   Becsült futás: 6 munkanap
   2026-11-16  ->  2026-11-27                  |
 ---------------------------------------------------------------------------------
 Ezt hagyod jóvá: 76 cég, 2 lépés, napi 15, sablon v3.     [ Jóváhagyás és indítás ]
 Bármely módosítás után újra jóvá kell hagyni.                (csak Áron)
```

Morning call view (Hívás mód, campaign tab):

```
 Hívás mód     [ Budapest indulás  ma 15 ]  [ Gépvevők  ma 8 ]  [ Szegmensek ]
 ---------------------------------------------------------------------------------
 Ma 15 / 15   hátra 61   lead lett 3   elérhetetlen 2                 Péter
 ---------------------------------------------------------------------------------
 XI. kerület (4)
   Példa Építő Kft.     ügyvezető    B   "2025 díjazott projekt, eltérés"   1. próba
   ...
 XIII. kerület (3)
   ...
 ---------------------------------------------------------------------------------
 Kiválasztva: Példa Építő Kft.   e-mail elment 11-16, nincs válasz
   [ Nem vették fel ] [ Érdeklődik ] [ Kéri ] [ Nem érdekli ] [ Rossz szám ]
   "Érdeklődik" vagy "Kéri" után a cég lead lesz a Leadek oldalon.
```

### Option 2: a new nav item "Kampányok"

One new item after Hívás mód holding the list, the launch screen and the members. Outreach keeps only the e-mail
queue. Clearer for Áron's word "campaign"; costs one more nav item and a second place where outreach campaigns
show (the Outreach dashboard would link out).

```
 Leadek | Hívás mód | Kampányok | Feladatok | ...
            Kampányok
            Budapest indulás   telefon + e-mail   fut     ma 15   lead 3
            Gépvevők           telefon            piszkozat
            Elveszett, időzítés  lead, hívás      jóváhagyásra vár
```

### Option 3: a "Prospektek" view on Leadek (not recommended)

A third view next to the board and the hívólista. Fastest to find, but it puts prospects on the leads page, which
is the line Áron drew, and crowds Leadek.

```
 Leadek     [ Tábla ] [ Hívólista ] [ Prospektek ]
```

## e. Build plan (slices of at most a day)

| # | Slice | Migration (additive) | API and actions | Size |
|---|---|---|---|---|
| S1 | Campaign object and members | `campaigns` + `channel`, `status` (CHECK), `daily_cap`, `owner_user_id` (FK users, SET NULL), `starts_on`, `ends_on`, `steps` jsonb, `audience` jsonb, `approved_by_id`, `approved_at`, `approved_hash`. New `campaign_members` (tenant_id, campaign_id, company_id, person_id?, lead_id?, step, state CHECK, attempts, next_eligible_on, priority, city, why, import_batch, created_company, created_at, state_changed_at; unique campaign_id + company_id). Rollback: drop the table and columns | `GET/POST /api/campaigns`, `GET /api/campaigns/:slug`, `POST /api/campaigns/:slug/members` (batch, `dry_run`, dedupe, receipt), `DELETE /api/campaigns/:slug/members?batch=` (undo). Session actions with `requireCrmUser` + tenant scope on every export | 1 day |
| S2 | Launch screen and approval | none | `/outreach/campaigns/<slug>`: counts, steps, cap, dates, approve (Áron only), pause, stop. `POST /api/campaigns/:slug/{approve,pause,stop}`; approve is a session action, never an app key | 1 day |
| S3 | Morning call view and promotion | none | Hívás mód campaign tabs: today's capped list on read, grouped by city. `recordCall` takes `campaignId`: stamps `interactions.campaign`, updates the member, applies the promotion rule (lead created without the SLA task). `GET /api/campaigns/:slug/today`; `POST /api/calls/result` gains `campaign` | 1 day |
| S4 | Launch-list loader | none | `build.py --campaign-members` + the dry-run, apply and undo commands (workspace repo, Kai's lane) | half a day |
| S5 | E-mail first step | none | Touch-1 drafts per member from the campaign; reply intake marks the member promoted by `thread_key`; no reply after N working days moves it to the call step | 1 day |
| S6 | Lead audiences (retargeting) | none | Lead-filter recipe; lead members call through `logLeadCallOutcome`; #165 sequences listed read only | 1 day |

**Enough for a phone campaign on the Budapest prospects: S1 + S2 + S3 + S4** (about three and a half days). That
is calls only: Péter starts on the 53 Budapest rows with a phone, 15 a day. The e-mail-first order (S5) follows when
a mailbox may send (warm-up ends 2026-11-23, Resend domain, `outreachFooter`). Decision 5 is whether to wait for it.

Do NOT build yet:

- Trip entities and trip batches (W8b section 3): a campaign with a city audience and dates covers the first trips.
- Automatic launch, automatic enrolment of prospects, or any agent approval.
- Any sending switch: `nurture_enabled` stays off; outreach send gates stay as they are.
- Sequences longer than two steps, A/B variants, per-campaign analytics beyond the counts on the launch screen.
- Merging #165 nurture tables or `email_drafts` into campaigns; the `leads.campaign` FK promotion (the slug stays the key).
- A release cron: the cap is computed on read.

## f. Decisions for Áron (popup-ready, recommendation first)

1. **Where does a prospect live?** (a) a company with no open lead, its campaign state on a membership row (recommended); (b) a separate prospect list; (c) a lead in a pre-stage on Leadek.
2. **Where do campaigns show?** (a) a Kampányok tab in Outreach, the daily list in Hívás mód (recommended); (b) a new Kampányok nav item; (c) a Prospektek view on Leadek.
3. **Daily call cap per campaign for Péter?** (a) 15 (recommended); (b) 10; (c) 25 (his whole day of dials per W8b).
4. **Which call outcomes turn a prospect into a lead?** (a) Érdeklődik and Kéri (recommended); (b) only Kéri; (c) any real conversation, Nem érdekli included as a lost lead.
5. **First campaign: start calls now or wait for e-mail first?** (a) Budapest phone-only next week, e-mail step added after the 11-23 warm-up (recommended); (b) wait and run e-mail first from day one; (c) e-mail by hand from the mailbox now, calls 3 working days after.
6. **The 261 launch-list rows with no phone or e-mail?** (a) load as prospects marked "needs contact", enrichment fills them (recommended); (b) leave them out until a contact is found; (c) load only the 221 contactable rows and drop the rest.

---

# v2: one Campaigns concept (2026-11-11 afternoon)

Áron approved the build of slice 1 and widened the frame: one Campaigns concept for marketing and sales, typed at
creation (ad, organic, cold call, cold e-mail, or a sequence of those), specified with AI help, with sequences,
per-campaign automations, connectors later, analytics, and engagement promoted to a lead. v1 above stays as the
history of this file. Everything below was checked against `dev` @ `23e9168`.

## v2.1 What exists today (from the code)

| Thing | Tables | Pages | What it drives |
|---|---|---|---|
| Marketing campaign | `campaigns` (slug, name, project, `audience_view_id`, `sender_user_id`, `current_wave`, `is_archived`) | `/marketing/campaigns` (list, create, archive), `/marketing/campaigns/<id>` (audience segment with live count, content items, sender, wave, export) | Groups `content_items` (`campaign_id`) in the approval pipeline; the audience segment is also the outreach target list (`/api/outreach/targets`) |
| Outreach campaign | no table of its own: the **same `campaigns.slug`**, stored as a string in `email_drafts.campaign`, `leads.campaign`, `interactions.campaign`, `content_items.outreach_campaign` | `/outreach` (draft queue, due today), `/outreach/campaigns` (funnel dashboard per key, sender and wave filters) | 4-touch e-mail drafts per company, manual or Resend send behind the footer and suppression gates; a reply becomes a lead (`markDraftReplied`, SLA call) |
| Phone round | none: a saved company segment | Hívás mód `/calls` | Company-level calls, `pipeline_status` move, optional follow-up task. No campaign tag, no cap, no script, no lead |
| Call script | `tenants.settings.scriptVariants` (A/B, tenant-wide) | `/leads/setup` | Shown on the lead page only. Hívás mód shows no script |
| Assets in review | `content_items` (+ versions, checks, reviews; category `script`, `email`, `ad`, `landing`, ...; format `phone_script`, `meta_ad`, ...) | `/marketing` (Anyagok, Élő anyagok, Döntések) | `POST /api/content` (app key) already lets an agent propose any asset into a campaign, as a draft that a human approves |
| Automations | `automation_rules` (triggers lead_created, lead_status_changed, deal stage, idle; conditions on event fields, `campaign` included) | `/automations` | Tasks, e-mails, assignment, webhooks |
| Analytics | computed on read | `/analytics` (pipeline status, revenue, top companies), `/reports/weekly` (sales engine), `/outreach/campaigns` (funnel per key) | No running-campaign view anywhere |

## v2.2 Where the brief's reading is wrong or needs a correction

- The merge is already half done in the data: since 2026-09-20 one `campaigns` row IS both the marketing content
  queue and the cold-email batch (comment on `model Campaign`). What is split is the UI: two pages over one
  table, and `/outreach/campaigns` also lists bare slug strings with no row. v2 merges by adding columns and
  tables to `campaigns`, not by migrating one store into another.
- The AI specification endpoint mostly exists: `POST /api/content` with `campaign_slug` already lands any asset
  (e-mail copy, call script, ad) in the approval pipeline as a proposal. What is new is a brief and a step plan
  for the campaign itself, also as a proposal.
- "Hívás mód shows the right script per campaign": no script is shown in Hívás mód today; scripts are tenant-wide
  A/B variants for the lead page. A per-campaign script is new: the campaign points at one LIVE content item
  (category `script`, format `phone_script`).
- Ad and organic campaigns have nothing to launch into: no ad platform or post scheduler is connected
  (`content_items.scheduled_for` and manual `metrics` only). In slice 1 they are content campaigns: assets through
  approval, results typed in by hand. The connector interface (v2.8) is where an ad platform plugs in later.
- Automations need no new engine for slice 1: a promotion fires the existing `lead_created` event with
  `campaign = <slug>`, so a per-campaign rule is a rule with the condition `campaign eq <slug>`. Member-level
  triggers (replied, no answer three times) come with sequences beyond two steps.

## v2.3 Merge map

| Merges cleanly | Does not merge (stays where it is) |
|---|---|
| Campaign identity: `campaigns` row, slug as the shared key | `email_drafts` keeps the e-mail mechanics (touches, waves, send gates); a campaign step points at it, it is not rewritten |
| Audience: the saved segment becomes one audience recipe of three (segment, import batch, lead filter) | #165 nurture sequences keep their tables; listed read-only on the campaign page until a later merge |
| Assets: `content_items.campaign_id` already; steps link to approved items | Tenant A/B scripts on the lead page stay; a campaign script overrides them only inside that campaign's calls |
| Funnel numbers: `/outreach/campaigns` counts plus the member counts | Hívás mód segment rounds keep working with no campaign |

## v2.4 Data model (additive migrations only)

`campaigns`, new nullable or defaulted columns (the existing row keeps working unchanged):
`kind` (CHECK `content`, `ad`, `organic`, `cold_call`, `cold_email`, `sequence`; NULL = a pre-v2 row),
`status` (CHECK `draft`, `running`, `paused`, `stopped`, `done`; default `draft`), `daily_cap` (default 15,
1 to 200), `owner_user_id`, `starts_on`, `ends_on`, `brief` jsonb (audience, offer, angle, notes: the spec),
`audience` jsonb (recipe), `call_script_item_id` (FK `content_items`, SET NULL), `approved_by_id`, `approved_at`,
`approved_hash`.

`campaign_steps` (new): `campaign_id`, `position`, `channel` (CHECK `email`, `call`, `ad`, `post`, `dm`),
`wait_days` (working days after the previous step), `audience_rule` (CHECK `all`, `no_reply`, `no_answer`),
`content_item_id` (the asset: e-mail copy, script, ad), unique (`campaign_id`, `position`).

`campaign_members` (new): `campaign_id`, `company_id`, `person_id?`, `lead_id?`, `step_position`, `state` (CHECK
`queued`, `needs_contact`, `promoted`, `declined`, `unreachable`, `excluded`, `done`), `attempts`,
`next_eligible_on`, `priority`, `tier`, `lane`, `phone_only`, `why`, `city`, `import_batch`, `created_company`,
`created_person`, `last_outcome`, `last_touched_at`, `created_at`, `state_changed_at`; unique (`campaign_id`,
`company_id`). Rollback: drop the two tables and the columns (written in the migration header).

Launch rule: only Áron's session (`demoHosts.aron`) moves `draft` or `paused` to `running`; the approval stores a
hash of members, steps and cap. Any edit to members, steps or cap of a running campaign returns it to `draft`
(the daily list empties until Áron approves again). No app key can approve, launch, raise a cap or send.

## v2.5 AI specification endpoint

`POST /api/campaigns/<slug>/specify`, app key (`validateAppKey`), tenant from the key, rate-limited like
`/api/content`. It may write ONLY: the `brief` (stored as a proposal next to the current one, never over a
human edit), proposed steps on a `draft` campaign, and assets through the existing `createItem` path (status
`draft` in the approval pipeline, `campaign_id` set). It refuses on a running campaign, never touches members
by itself (members go through the dry-run loader), and can never approve, launch, change the cap or send. The
in-app assistant can call the same service later; nothing in it changes in slice 1.

## v2.6 Promotion rules (prospect to lead)

| Engagement | Result |
|---|---|
| Call: Érdeklődik | Lead created on the company, stage `contacting`, owner Péter, next action = follow-up in 7 days (or the date the caller set), `campaign = <slug>`. No SLA task: the call already happened |
| Call: Kéri / akarja | Lead created, stage `qualified`, next action in 2 days |
| Call: Nem vették fel | Stays a prospect: attempts + 1, back on the list after 2 working days, `unreachable` after 3 |
| Call: Nem érdekli / Rossz szám | Member `declined` / `excluded`, no lead |
| E-mail: positive reply | Lead through the existing reply intake, stage `new` WITH the SLA call (one task per real reply) |
| E-mail: negative reply / unsubscribe | `declined`; unsubscribe also writes a suppression |
| E-mail sent, no reply after `wait_days` | Member moves to the call step and enters the capped list |
| Company already has an open lead | Member linked to it, the call is logged on it, its stage moves forward only through the tenant's transition table |
| Later: form fill, DM reply | Same promotion through the connector's inbound event |

Who gets which first step: Péter's own past clients (`phone_only`, the builder's warm lane) start at the call
step; unknown firms start at the e-mail step; a member with no e-mail skips to the call step; no phone and no
e-mail = `needs_contact`, never on a list. The daily list is computed on read: running campaign, members on a
call step, `next_eligible_on` today or earlier, priority then city, at most `daily_cap` minus those already
touched today.

## v2.7 Analytics additions

One query layer (`lib/campaigns/analytics.ts`), pure aggregation tested on fixtures: per campaign audience,
needs contact, touched, replied, promoted to lead, booked (lead reached `discovery_booked` or `demo_booked`),
declined, unreachable; split by step and by day. Shown as a "Futó kampányok" strip on `/analytics` and on the
campaign page (after Áron's mockup pick). `/outreach/campaigns` and `/reports/weekly` stay as they are.

## v2.8 Connector interface (description only, nothing built)

A connector is a registered app key with a `kind` (ad platform, DM bot, form) that may: read a running campaign's
approved assets and audience size, post engagement events (`POST /api/campaigns/<slug>/outcome` with
`kind: dm_reply | form_fill | ad_lead`, deduped by an external id), and post spend and reach numbers. It never
reads contact data of members it did not create and never launches. Outbound sends through a connector sit
behind the same per-campaign approval and a per-connector switch, off by default.

## v2.9 Mockups

`docs/proposals/mockups/campaigns-a-hub.html` and `docs/proposals/mockups/campaigns-b-two-homes.html`:

- **A, one Campaigns hub**: a new "Kampányok" nav item; marketing and sales campaigns in one list with the type as
  filter tabs; create, specify, launch and analytics on one campaign page. Marketing and Outreach keep their
  pages; their own campaign tabs link into the hub.
- **B, two homes, one shared layer**: no new nav item. Marketing campaigns stay under Marketing > Kampányok, sales
  campaigns live under Outreach > Kampányok; both open the same shared campaign page (specify, launch, analytics),
  and running campaigns show on `/analytics`.

Both show the call view in Hívás mód with the campaign script. Áron picks before any UI is built.

## v2.10 Decisions for Áron (replace v1 section f; recommendation first)

1. **Which Campaigns area?** (a) A: one Kampányok hub, new nav item, types as tabs (recommended: it is the "merge them together" you asked for, and no existing page is renamed); (b) B: campaigns stay in Marketing and Outreach, one shared campaign page and analytics.
2. **Deploy the slice 1 backend (#188) now?** (a) yes: apply the migration, verify, then merge; nothing visible changes and the API is ready for agents (recommended); (b) wait and ship it with the UI.
3. **First campaign: calls now or e-mail first?** (a) Budapest phone-only from next week, e-mail step added after the 11-23 warm-up (recommended); (b) wait and run e-mail first from day one.
4. **Daily call cap for Péter?** (a) 15 (recommended); (b) 10; (c) 25.
5. **The 261 launch-list rows with no phone or e-mail?** (a) load as "needs contact", enrichment fills them, never on a list until then (recommended); (b) leave them out.
