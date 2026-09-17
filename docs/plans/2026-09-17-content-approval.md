# Content Approval Pipeline Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** One readable place in the CRM where Áron and Péter review content version by version, an AI rewrite loop turns their comments into new versions, and only dual-approved ("live") content is used by operations.

**Architecture:** Extend `ContentItem` / `ContentAsset` / `Campaign` with an immutable `ContentVersion` + per-reviewer `ContentReview`. All status changes go through ONE pure function (`lib/content/transitions.ts`) and ONE DB service (`lib/content/service.ts`) used by the server actions (humans) and the app-key API (the `content-revise` Claude Code skill). The CRM never calls an LLM.

**Tech Stack:** Next.js 16 (app router, server actions), Prisma 7 + Postgres (Supabase, Frankfurt), Supabase Storage (private bucket), Resend, Vitest, Vercel Cron.

**Spec:** `/home/aron166/Projects/workspace/docs/specs/2026-09-17-content-approval-design.md` (binding — read it with this plan).

## Global Constraints
- Dual approval: live only when BOTH configured reviewers approved the SAME version.
- Any edit = new version; reviews belong to a version, so a new version resets them by construction.
- Verdicts: `approve | changes | rewrite`; `changes` and `rewrite` require a comment.
- The CRM never calls an LLM. App-key routes can never set a verdict or mark anything live.
- Race rule: an AI version is rejected with 409 if a human version was created after the AI's claim.
- Stale AI claims (> 2 h) are released.
- Reviewers come from `tenants.settings.contentReviewers` (array of users.id), never code.
- Operations consume live versions only; never fall back to a non-live version.
- Readability: body 17–18 px, line-height ≥ 1.6, max ~70ch, no monospace prose, „ ” quotes, ≥ 44 px targets, sticky action bar on mobile; verified at 390 px and 1440 px.
- Every server action: its own auth check (`getActor`) + reviewer check where it writes a review.
- Every new app-key route goes on `isServiceApiPath` (`web/src/proxy.ts`) in the same PR, with table-test rows.
- AuditLog on every verdict, version and live switch.
- HU UI strings are ⚠️ proposals (translating-english-to-hungarian), listed in the PR.
- No dev DB: `web/.env` is PROD. No scripts that write prod rows except explicit, audited data fixes. Local fixture rendering uses a throwaway Docker Postgres.
- Migrations: applied to prod with `prisma migrate deploy` and verified BEFORE merge.
- Check a path does not exist before creating a file (lesson 2026-09-17).

## PR split
| PR | Scope | Migration |
|---|---|---|
| **(a)** | schema + transitions + service + app-key API + proxy + server actions + reviewer settings | `20260917200000_content_versions` |
| **(b)** | `/content` inbox, review page (diff, history, action bar, editor), library, nav badge, `/` tile, storage uploads + signed URLs, `/marketing` → `/content` | — (bucket created on prod) |
| **(c)** | `content-revise` skill + mock-API e2e, daily digest cron, script-panel live-content wiring | — |
| **(d)** | import script (dry-run only) | — |
| **(e)** | spec §6b: `/marketing` hub (Anyagok · Kampányok), `Campaign.kind`, `email_drafts` → `Campaign` (by slug, incl. prod `TESZT`), create-campaign UI (cold_email), item → campaign slot from the review page, outreach consumes the LIVE step template only; `/outreach` + `/marketing/campaigns` redirect | `…_campaign_unify` |

---

## PR (a)

### Task A1: Schema + migration

**Files:**
- Modify: `web/prisma/schema.prisma` (ContentItem, ContentAsset, new ContentVersion, ContentReview, User back-relations)
- Create: `web/prisma/migrations/20260917200000_content_versions/migration.sql`

**Interfaces — produces (Prisma model fields):**
- `ContentItem`: + `category String @default("other")`, `format String?`, `purpose String?`, `externalRef String? @map("external_ref")`, `currentVersionId Int? @unique`, `liveVersionId Int? @unique`, `claimedAt DateTime?`, `claimedBy String?` (app slug), `needsHumanAsset Boolean @default(false)`. `body` stays and always mirrors the CURRENT version (single writer: the service). `@@index([tenantId, category])`.
- `ContentVersion`: `id, tenantId, itemId, number, body, authorType ("ai"|"user"|"import"), authorUserId Int?, authorApp String?, changeNote String?, basedOnVersionId Int?, createdAt`. `@@unique([itemId, number])`. No `updatedAt` (immutable).
- `ContentReview`: `id, tenantId, versionId, reviewerUserId, verdict, comment String?, createdAt, updatedAt`. `@@unique([versionId, reviewerUserId])`.
- `ContentAsset`: + `versionId Int?` (FK SetNull), `storagePath String?`, `mimeType String?`, `sizeBytes Int?`.

**Data step in the migration (documented mapping of old statuses):**
- every existing item gets version 1 (`author_type='import'`, body = item body), `current_version_id` = it;
- `approved | scheduled | published` → `live` with `live_version_id` = v1;
- `rejected` → `archived`; `draft`, `in_review` unchanged;
- `category`: `content_type='email'` → `email`, `video_script` → `video`, else `other`;
- existing assets → `version_id` = the item's v1.

- [ ] Step 1: edit schema; generate SQL with `npx prisma migrate diff --from-schema <old copy> --to-schema prisma/schema.prisma --script`, add the data step + rollback header.
- [ ] Step 2: `npx prisma generate && npx tsc --noEmit`.
- [ ] Step 3: commit `feat(content): versions, reviews and live pointer schema`.

### Task A2: Pure transition function + table test

**Files:** Create `web/src/lib/content/transitions.ts`, `web/src/lib/content/transitions.test.ts`, `web/src/lib/content/types.ts`

**Interfaces — produces:**
```ts
export const CONTENT_STATUSES = ["draft","in_review","changes_requested","rewrite_requested","ai_working","live","archived"] as const;
export type ContentStatus = typeof CONTENT_STATUSES[number];
export const VERDICTS = ["approve","changes","rewrite"] as const;
export type Verdict = typeof VERDICTS[number];
export const CLAIM_TTL_MS = 2 * 60 * 60 * 1000;
export const REQUESTABLE: ContentStatus[] = ["changes_requested","rewrite_requested"];

export interface ItemState {
  status: ContentStatus;
  currentVersionId: number | null;
  liveVersionId: number | null;
  claimedAt: Date | null;
}
export type ContentEvent =
  | { type: "version_created"; versionId: number; by: "ai" | "user" | "import"; createdAt: Date }
  | { type: "reviews_changed"; reviewers: number[]; reviews: { reviewerUserId: number; verdict: Verdict }[] }
  | { type: "claim"; now: Date }
  | { type: "release_stale"; now: Date }
  | { type: "archive" };
export type TransitionResult =
  | { ok: true; state: ItemState; wentLive: boolean }
  | { ok: false; code: "conflict" | "invalid"; reason: string };
export function applyEvent(state: ItemState, event: ContentEvent): TransitionResult;
export function statusFromReviews(reviewers: number[], reviews: {reviewerUserId:number; verdict: Verdict}[]): "in_review"|"changes_requested"|"rewrite_requested"|"live";
```
Rules: `version_created` → `in_review`, current = new id, claim cleared (for `by: "ai"` the caller must first check the race rule, see A3). `reviews_changed` → `statusFromReviews`; `live` sets `liveVersionId = currentVersionId` and `wentLive`. Any `rewrite` wins over `changes`; `live` needs every configured reviewer to approve (an empty reviewer list is never live). `claim` only from REQUESTABLE, or from `ai_working` when the claim is stale; otherwise `conflict`. `release_stale` → back to the status derived from reviews is not known here, so the caller passes it; the pure function returns `rewrite_requested` if unknown. (Simplification: store `claimedFrom` in the state so release restores it: add `claimedFrom: ContentStatus | null` to ItemState and to the schema as `claimed_from`.) `archive` from any status.

Table test rows (minimum): new version from every status; approve+approve → live; approve+changes → changes_requested; changes+rewrite → rewrite_requested; one approve only → in_review; reviewer not in list ignored; empty reviewer list never live; claim from changes_requested/rewrite_requested ok; claim from in_review/live/draft → conflict; claim on fresh ai_working → conflict; claim on stale ai_working → ok; release_stale fresh → no-op; release_stale stale → claimedFrom restored; live item + new version → in_review with liveVersionId kept.

- [ ] Steps: failing table test → implement → pass → commit `feat(content): status transition function with table test`.

### Task A3: DB service

**Files:** Create `web/src/lib/content/service.ts`, `web/src/lib/content/reviewers.ts`, `web/src/lib/content/service.test.ts`

**Interfaces — produces:**
```ts
// reviewers.ts
export function reviewersFromSettings(settings: unknown): number[];      // zod: array of positive ints, deduped, max 2
export async function getContentReviewers(tenantId: number): Promise<number[]>;
// service.ts
export interface ContentActor { tenantId: number; kind: "user"; userId: number } | { tenantId: number; kind: "app"; appSlug: string }
export async function createItem(actor, input: { title; category; format?; purpose?; channel; contentType; campaignId?; externalRef?; body; changeNote?; internal? }): Promise<{ itemId: number; versionId: number }>;
export async function createVersion(actor, itemId: number, input: { body: string; changeNote?: string; basedOnVersionId: number }): Promise<{ ok: true; versionId: number; number: number } | { ok: false; status: 404 | 409 | 400; error: string }>;
export async function submitReview(actor: user, versionId: number, verdict: Verdict, comment?: string): Promise<{ ok: true; status: ContentStatus; wentLive: boolean } | { ok: false; status: 400|403|404|409; error: string }>;
export async function claimItem(actor: app, itemId: number, now?: Date): Promise<{ ok: true } | { ok: false; status: 404|409; error: string }>;
export async function releaseStaleClaims(tenantId: number, now?: Date): Promise<number>;
export async function getQueue(tenantId: number, statuses: ContentStatus[]): Promise<QueueItem[]>;
export async function getLive(tenantId: number, filter: { category?; campaignSlug?; format? }): Promise<LiveItem[]>;
export async function archiveItem(actor: user, itemId: number): Promise<...>;
```
Rules enforced here: `createVersion` — `basedOnVersionId` must equal the item's current version (else 409 "stale base"); for `app` actors the item must be `ai_working` and no `user` version may exist with `createdAt > claimedAt` (else 409 race rule); `app` actors need `changeNote`. `submitReview` — actor must be in `getContentReviewers`, the version must be the item's CURRENT version (a review on an old version is 409), comment required for changes/rewrite, upsert on (version, reviewer), recompute status via `applyEvent`. Every write in one transaction with an `auditLog` row (`entity_type` `content_item` / `content_version` / `content_review`). Row lock: `SELECT … FOR UPDATE` on the item inside the transaction (`tx.$queryRaw`) so a claim and a human edit serialize.

Tests (mocked db like `lib/leads/service.test.ts`): reviewer not configured → 403; old version → 409; comment missing → 400; both approve → live + audit; app version without claim → 409; human version after claim → AI 409; stale base → 409.

- [ ] Steps: tests → implement → pass → commit `feat(content): content service (versions, reviews, claims, live)`.

### Task A4: App-key API + proxy
**Files:** Modify `web/src/app/api/content/route.ts` (create via `createItem`, new optional fields `category`, `format`, `purpose`, `external_ref`; `status` always `in_review`); Create `web/src/app/api/content/queue/route.ts` (GET), `web/src/app/api/content/live/route.ts` (GET), `web/src/app/api/content/[id]/claim/route.ts` (POST), `web/src/app/api/content/[id]/versions/route.ts` (POST); Modify `web/src/proxy.ts` + its table test; `docs/api.md`.
- Queue response per item: `{ id, title, category, format, purpose, channel, status, campaign: {slug,name}|null, externalRef, needsHumanAsset, currentVersion: {id, number, body, changeNote, authorType}, assets: [{kind, mimeType, caption}], reviews: [{versionNumber, reviewer (name), verdict, comment, createdAt}] /* ALL versions, newest first */, versions: [{number, changeNote, authorType, createdAt}] }`. Calls `releaseStaleClaims` first.
- Versions body: `{ body, change_note, based_on_version_id, needs_human_asset? }` → 201 `{ versionId, number }`; 409 on race/stale.
- Proxy: `pathname === "/api/content/queue" || pathname === "/api/content/live" || /^\/api\/content\/\d+\/(claim|versions)$/.test(pathname)`.
- [ ] Contract tests per route (mock service) + proxy table rows → commit.

### Task A5: Server actions + minimal legacy rewiring
**Files:** Create `web/src/app/actions/content.ts`; Modify `web/src/app/actions/marketing.ts` (remove approve/reject/backToEdit; `updateContent` → `createVersion` as user), `web/src/app/(app)/marketing/[id]/MarketingDetailClient.tsx` (drop the removed buttons), `web/src/lib/marketing/types.ts` (statuses re-exported from lib/content/types).
- Actions (each: `getActor` → CRM user; review actions also reviewer check in the service): `submitContentReview(versionId, verdict, comment?)`, `saveContentVersion(itemId, basedOnVersionId, body, changeNote?)`, `archiveContent(itemId)`, `getContentReviewersForUi()`, `saveContentReviewers(userIds)` (admin-ish: must itself be a CRM user; validates users belong to tenant; `setTenantSettings`).
- [ ] Tests for auth refusal → commit.

### Task A6: Prod prerequisites (lead)
- [ ] Read-only: Péter's `users` row + `auth.users` row (done 2026-09-17: id 3, confirmed, last sign-in 2026-05-13).
- [ ] Data write (audited): `tenants(1).settings.contentReviewers = [2, 3]`.
- [ ] Vanda → triage → migration applied + verified → merge → smoke (`/api/content/queue` with no key → 401; pages 200).

## PR (b) — UI + files
### Task B1: storage
`web/src/lib/content/storage.ts` — service-role client (server only), bucket `content-assets` (private, created once on prod via the storage API, 50 MB limit, mime allow-list: image/png, image/jpeg, image/webp, image/gif, video/mp4, video/webm, application/pdf). Path `t{tenantId}/items/{itemId}/v{number}/{uuid}-{safeName}`. `createSignedUploadUrl` for the browser upload (so large videos bypass the server-action body limit) + `registerUploadedAsset` action that verifies the object exists, mime and size, then inserts the `content_assets` row; `signedViewUrl(path, 3600)`.
### Task B2: `/content` inbox
Sections: "Rám vár" (current version not yet judged by me, grouped by category with counts, > 3 days highlighted), "A másik bírálóra vár", "AI dolgozik rajta", "Élő". Filters (category, campaign, format, status) as URL params.
### Task B3: review page `/content/[id]`
Header (category, purpose, campaign, format, status chip, per-reviewer verdict of current version), reading pane (react-markdown already installed? — check; otherwise a minimal safe renderer: paragraphs, headings, lists, bold/italic, links; no raw HTML), word-level diff toggle vs previous version (`diff` package if installed, otherwise an LCS on word tokens in `lib/content/diff.ts` with a test), version history with change notes, full comment history, assets inline (`<video controls>`, image lightbox, PDF link), sticky action bar (✅/✏️/♻️/✎) with required-comment sheet, editor that warns "mindkét jóváhagyás elvész".
### Task B4: library `/content/live`, nav badge, `/` tile, `/marketing` → `/content` redirects (campaign pages stay).
### Task B5: screenshots — throwaway Docker Postgres on :5433, `migrate deploy`, fixture seed script (`web/scripts/content-fixtures.mjs`, refuses any DATABASE_URL not on localhost), `next build && next start` with local env, session cookie from `.smoke-auth.mjs`, Playwright screenshots at 390×844 and 1440×900 → `docs/screenshots/content/`.

## PR (c) — loop, digest, consumers
### Task C1: `.claude/skills/content-revise/SKILL.md` + `scripts/content-revise-mock.mjs` (local mock of queue/claim/versions with fixture items + asserts) + e2e run by a subagent following the skill against the mock.
### Task C2: digest — `web/src/lib/content/digest.ts` (pure: build per-reviewer list, oldest first, > 3 days flagged, empty → skip), `web/src/app/api/cron/content-digest/route.ts` (CRON_SECRET; sends only when Budapest hour is 8 and weekday), `vercel.json` cron `0 6,7 * * 1-5`, proxy allowlist, per-reviewer opt-out `settings.contentDigestOptOut: number[]` toggle on `/content`.
### Task C3: script panel — script variants accept `contentItemId`; the panel shows the live body or "nincs élő változat" (never the draft text). (Outreach consumption moved to PR (e), where campaign slots exist.)

## PR (e) — marketing hub + campaign unification (spec §6b, addendum 2026-09-17)
- Migration: `campaigns.kind` (`cold_email | ads | content`, default `content`); `email_drafts.campaign_id` FK; data step creates one `cold_email` Campaign per distinct `email_drafts.campaign` string (slug = `threadKeyFor` slug of the string; existing slug reused) and back-fills `campaign_id` — prod `TESZT` included. The string column stays until every consumer reads `campaign_id`.
- `content_items.campaign_slot` (e.g. `cold_email:step:1`, `setter_script`): an item assigned to a campaign + slot; `getLive` by campaign + slot is how consumers read it.
- `/marketing` hub: tabs **Anyagok** (`/marketing` = inbox, `/marketing/live`) and **Kampányok** (`/marketing/campaigns`, filter by kind; cold_email detail = today's `/outreach` queue + dashboard). `/content*`, `/outreach*` redirect.
- Create campaign (cold_email): name → companies or saved view → sender + wave per company → attach live step items (slots 1–4).
- Review page: "Kampányba" picker (campaign + slot, inline create).
- Outreach: a draft whose campaign has a live step-N item uses that live body; copy / "Kézzel elküldve" disabled with a reason when the slot's item is not live. Pipeline strip in the UI: Vázlat → Jóváhagyás → Élő → Kampányban használva.

## PR (d) — import
`web/scripts/import-content.mjs`: dry-run default, `--apply` refuses without `--i-have-arons-approval` + `CRM_URL`/`CRM_APP_KEY`; posts through `POST /api/content` with `external_ref`; idempotent by `external_ref` (the route returns the existing item when the ref exists — add that to A4). Sources: 20 cold-email sequences (one item per touch), setter script, demo offer, signature/legal line, lead magnet, Market Építő note, BirdsView email, BirdsView ad rough cut mp4s (asset upload in apply mode only).

## Self-review
Spec §1 → A1–A3; transitions + race + stale → A2/A3; §2 files → B1/B3; §3 API → A4, skill → C1, import → D; §4 screens → B2–B5; §5 digest/highlight/tile → C2/B2/B4; §6 consumers → C3; §7 gates → every PR. Gap closed: import idempotency needs the API to dedupe on `external_ref` (added to A4).
