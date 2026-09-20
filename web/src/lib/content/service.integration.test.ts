// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { ContentActor } from "./service";

/**
 * Integration tests against a real local Postgres (the throwaway fixture DB,
 * never `web/.env`'s production database). Skipped unless
 * CONTENT_IT_DATABASE_URL is set and obviously local — see the guard below.
 *
 * Run: CONTENT_IT_DATABASE_URL=postgresql://postgres:fixture@127.0.0.1:5439/ndtcrm \
 *   npx vitest run src/lib/content/service.integration.test.ts
 */
const CONNECTION = process.env.CONTENT_IT_DATABASE_URL;
const enabled = Boolean(CONNECTION && (CONNECTION.includes("127.0.0.1") || CONNECTION.includes("localhost")));

describe.skipIf(!enabled)("content service (integration)", () => {
  let db: typeof import("@/lib/db")["db"];
  let service: typeof import("./service");

  let userA: number; // reviewer
  let userB: number; // reviewer
  let userC: number; // not a reviewer
  const createdItemIds: number[] = [];
  let prevSettings: unknown = null;

  const appActor: ContentActor = { tenantId: 1, kind: "app", appSlug: "it" };
  const actorA = () => ({ tenantId: 1, kind: "user" as const, userId: userA });
  const actorB = () => ({ tenantId: 1, kind: "user" as const, userId: userB });

  let seq = 0;
  const title = () => `IT-${Date.now()}-${(seq += 1)}`;

  async function newItem(body = "body", category: "other" | "email" = "other") {
    const r = await service.createItem(appActor, {
      title: title(), body, category, channel: category === "email" ? "email" : "other",
      contentType: category === "email" ? "email" : "other", source: "it",
    });
    if (!r.ok) throw new Error(`setup: createItem failed: ${r.error}`);
    createdItemIds.push(r.itemId);
    return r;
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    ({ db } = await import("@/lib/db"));
    service = await import("./service");

    // Clean up any leftovers from a previously-aborted run before creating fresh rows.
    await db.user.deleteMany({ where: { email: { in: ["it-aron@example.test", "it-peter@example.test", "it-nonreviewer@example.test"] } } });

    const a = await db.user.create({ data: { tenantId: 1, name: "IT Aron", email: "it-aron@example.test", passwordHash: "x" } });
    const b = await db.user.create({ data: { tenantId: 1, name: "IT Peter", email: "it-peter@example.test", passwordHash: "x" } });
    const c = await db.user.create({ data: { tenantId: 1, name: "IT Nonreviewer", email: "it-nonreviewer@example.test", passwordHash: "x" } });
    userA = a.id; userB = b.id; userC = c.id;

    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: 1 }, select: { settings: true } });
    prevSettings = tenant.settings;
    const merged = { ...(tenant.settings as Record<string, unknown> | null), contentReviewers: [userA, userB] };
    await db.tenant.update({ where: { id: 1 }, data: { settings: merged } });
  });

  afterAll(async () => {
    if (!db) return;
    if (createdItemIds.length) {
      // Cascades to content_versions then content_reviews (real DB FK ON DELETE CASCADE).
      await db.contentItem.deleteMany({ where: { id: { in: createdItemIds } } });
    }
    await db.user.deleteMany({ where: { id: { in: [userA, userB, userC].filter((x) => x != null) } } });
    await db.tenant.update({ where: { id: 1 }, data: { settings: prevSettings as never } });
    await db.$disconnect();
  });

  it("creates an item in_review with an audit trail, idempotent on externalRef", async () => {
    const ref = `IT-ref-${Date.now()}`;
    const r1 = await service.createItem(appActor, {
      title: title(), body: "hello", category: "other", channel: "other", contentType: "other", source: "it", externalRef: ref,
    });
    expect(r1.ok).toBe(true);
    if (!r1.ok) return;
    createdItemIds.push(r1.itemId);

    const item = await db.contentItem.findUniqueOrThrow({ where: { id: r1.itemId } });
    expect(item.status).toBe("in_review");
    expect(item.currentVersionId).toBe(r1.versionId);

    const version = await db.contentVersion.findUniqueOrThrow({ where: { id: r1.versionId! } });
    expect(version.number).toBe(1);

    const itemAudits = await db.auditLog.findMany({ where: { entityType: "content_item", entityId: r1.itemId } });
    expect(itemAudits.length).toBeGreaterThan(0);
    const versionAudits = await db.auditLog.findMany({ where: { entityType: "content_version", entityId: r1.versionId! } });
    expect(versionAudits.length).toBeGreaterThan(0);

    const r2 = await service.createItem(appActor, {
      title: title(), body: "hello again", category: "other", channel: "other", contentType: "other", source: "it", externalRef: ref,
    });
    expect(r2).toMatchObject({ ok: true, existed: true, itemId: r1.itemId });
    const count = await db.contentItem.count({ where: { tenantId: 1, externalRef: ref } });
    expect(count).toBe(1);
  });

  it("review flow: non-reviewer 403, changes needs a comment, dual approve goes live", async () => {
    const r = await newItem();
    const versionId = r.versionId!;
    const nonReviewer = { tenantId: 1, kind: "user" as const, userId: userC };

    const forbidden = await service.submitReview(nonReviewer, versionId, "approve");
    expect(forbidden).toMatchObject({ ok: false, status: 403 });

    const noComment = await service.submitReview(actorA(), versionId, "changes", undefined, "wording");
    // …and a send-back without a reason tag is refused too.
    const noReason = await service.submitReview(actorA(), versionId, "changes", "javítsd");
    expect(noReason).toMatchObject({ ok: false, status: 400 });
    expect(noComment).toMatchObject({ ok: false, status: 400 });

    const first = await service.submitReview(actorA(), versionId, "approve");
    expect(first).toMatchObject({ ok: true, status: "in_review", wentLive: false });

    const second = await service.submitReview(actorB(), versionId, "approve");
    expect(second).toMatchObject({ ok: true, status: "live", wentLive: true });

    const item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId } });
    expect(item.liveVersionId).toBe(versionId);

    const audits = await db.auditLog.findMany({ where: { entityType: "content_item", entityId: r.itemId } });
    const liveAudit = audits.some((a) => (a.changes as { after?: { status?: string } }).after?.status === "live");
    expect(liveAudit).toBe(true);
  });

  it("reviewing a version that is no longer current conflicts", async () => {
    const r = await newItem();
    const v2 = await service.createVersion(actorA(), r.itemId, { body: "v2", changeNote: null, basedOnVersionId: r.versionId! });
    expect(v2.ok).toBe(true);

    const stale = await service.submitReview(actorA(), r.versionId!, "approve");
    expect(stale).toMatchObject({ ok: false, status: 409 });
  });

  it("fromSource: importer posts a version without a claim, but never over an AI rewrite", async () => {
    const r = await service.createItem(appActor, {
      title: title(), body: "imported body", category: "other", channel: "other",
      contentType: "other", source: "it", externalRef: `it-ref-${Date.now()}-${Math.random()}`,
    });
    if (!r.ok) throw new Error("setup");
    createdItemIds.push(r.itemId);

    // No claim, no rewrite request: a plain app version is refused...
    const unclaimed = await service.createVersion(appActor, r.itemId, {
      body: "restated", changeNote: "source changed", basedOnVersionId: r.versionId!,
    });
    expect(unclaimed).toMatchObject({ ok: false, status: 409 });

    // ...but the importer path goes through, with the stale-base rule intact.
    const staleBase = await service.createVersion(appActor, r.itemId, {
      body: "restated", changeNote: "source changed", basedOnVersionId: r.versionId! + 999_999,
      fromSource: true,
    });
    expect(staleBase).toMatchObject({ ok: false, status: 409 });

    const ok = await service.createVersion(appActor, r.itemId, {
      body: "restated from the source file", changeNote: "source changed", basedOnVersionId: r.versionId!,
      fromSource: true,
    });
    expect(ok).toMatchObject({ ok: true, number: 2 });
    if (!ok.ok) return;

    // While the AI holds a claim, the importer must not overwrite it.
    await service.submitReview(actorA(), ok.versionId, "rewrite", "please rewrite", "wording");
    await service.claimItem(appActor, r.itemId);
    const duringRewrite = await service.createVersion(appActor, r.itemId, {
      body: "restated again", changeNote: "source changed again", basedOnVersionId: ok.versionId,
      fromSource: true,
    });
    expect(duringRewrite).toMatchObject({ ok: false, status: 409 });
  });

  it("fromSource is refused on an item that has no source file", async () => {
    const r = await newItem(); // no externalRef, source "it"
    const res = await service.createVersion(appActor, r.itemId, {
      body: "app text over a human draft", changeNote: "nope", basedOnVersionId: r.versionId!,
      fromSource: true,
    });
    expect(res).toMatchObject({ ok: false, status: 409 });
  });

  it("duplicate_hook fires on FIRST submit, not only from version 2", async () => {
    const slug = `it-campaign-${Date.now()}`;
    const campaign = await db.campaign.create({ data: { tenantId: 1, name: slug, slug } });
    const body = "Kedves Kovács Úr, a 2024-es Duna-hídi felújítás kapcsán keresem, betonvizsgálat ügyében.";
    const first = await service.createItem(appActor, {
      title: title(), body, category: "email", channel: "email", contentType: "email",
      source: "it", campaignId: campaign.id,
    });
    if (!first.ok) throw new Error("setup");
    createdItemIds.push(first.itemId);

    const second = await service.createItem(appActor, {
      title: title(), body, category: "email", channel: "email", contentType: "email",
      source: "it", campaignId: campaign.id,
    });
    if (!second.ok) throw new Error("setup");
    createdItemIds.push(second.itemId);

    const checks = await db.contentCheck.findMany({ where: { itemId: second.itemId, source: "rule" } });
    expect(checks.some((c) => c.question.includes("nyitása"))).toBe(true);
    const item = await db.contentItem.findUniqueOrThrow({ where: { id: second.itemId } });
    expect(item.status).toBe("rewrite_requested");
    // The campaign is left behind on purpose: the items still reference it, and
    // afterAll removes them. Each run makes its own slug, so nothing leaks between runs.
  });

  it("setOutreachSlot: one item per step, email only, and it can be cleared", async () => {
    const campaign = `IT-SLOT-${Date.now()}`;
    const a = await newItem("a", "email");
    const b = await newItem("b", "email");
    const notEmail = await newItem("c");

    expect(await service.setOutreachSlot(actorA(), a.itemId, { campaign, step: 1 })).toMatchObject({ ok: true });

    // The slot is taken: a second item cannot silently steal it.
    expect(await service.setOutreachSlot(actorA(), b.itemId, { campaign, step: 1 }))
      .toMatchObject({ ok: false, status: 409 });
    // A different step in the same campaign is free.
    expect(await service.setOutreachSlot(actorA(), b.itemId, { campaign, step: 2 })).toMatchObject({ ok: true });

    // Only email content belongs in a cold-email sequence.
    expect(await service.setOutreachSlot(actorA(), notEmail.itemId, { campaign, step: 3 }))
      .toMatchObject({ ok: false, status: 400 });
    expect(await service.setOutreachSlot(actorA(), a.itemId, { campaign, step: 0 }))
      .toMatchObject({ ok: false, status: 400 });
    // A draft can only ever be steps 1..MAX_STEP, so a slot above that gates nothing.
    expect(await service.setOutreachSlot(actorA(), a.itemId, { campaign, step: 9 }))
      .toMatchObject({ ok: false, status: 400 });

    // Re-assigning the SAME item to its own slot is not a conflict.
    expect(await service.setOutreachSlot(actorA(), a.itemId, { campaign, step: 1 })).toMatchObject({ ok: true });

    // Clearing frees the slot.
    expect(await service.setOutreachSlot(actorA(), a.itemId, null)).toMatchObject({ ok: true });
    expect(await service.setOutreachSlot(actorA(), b.itemId, { campaign, step: 1 })).toMatchObject({ ok: true });

    const row = await db.contentItem.findUniqueOrThrow({ where: { id: a.itemId } });
    expect(row.outreachCampaign).toBeNull();
    expect(row.outreachStep).toBeNull();
  });

  it("setOutreachSlot: an internal item is refused a slot; a non-internal email item still gets one", async () => {
    const campaign = `IT-INTERNAL-${Date.now()}`;
    const internal = await service.createItem(appActor, {
      title: title(), body: "internal reference copy", category: "email", channel: "email",
      contentType: "email", source: "it", internal: true,
    });
    if (!internal.ok) throw new Error("setup");
    createdItemIds.push(internal.itemId);
    const notInternal = await newItem("outbound copy", "email");

    const refused = await service.setOutreachSlot(actorA(), internal.itemId, { campaign, step: 1 });
    expect(refused).toMatchObject({ ok: false, status: 400, error: "Belső anyag nem tölthet be kampánylépést" });

    const ok = await service.setOutreachSlot(actorA(), notInternal.itemId, { campaign, step: 1 });
    expect(ok).toMatchObject({ ok: true });
  });

  it("two items racing for the same slot: exactly one wins, the loser gets a 409", async () => {
    const campaign = `IT-RACE-${Date.now()}`;
    const a = await newItem("a", "email");
    const b = await newItem("b", "email");
    const results = await Promise.all([
      service.setOutreachSlot(actorA(), a.itemId, { campaign, step: 1 }),
      service.setOutreachSlot(actorB(), b.itemId, { campaign, step: 1 }),
    ]);
    expect(results.filter((r) => r.ok)).toHaveLength(1);
    const loser = results.find((r) => !r.ok);
    // Never a 500: the unique index is the gate, and it must read as the designed conflict.
    expect(loser).toMatchObject({ ok: false, status: 409 });

    const filled = await db.contentItem.findMany({
      where: { tenantId: 1, outreachCampaign: campaign, outreachStep: 1 },
      select: { id: true },
    });
    expect(filled).toHaveLength(1);
  });

  it("a rule check cannot be waived or answered by hand", async () => {
    const r = await newItem();
    const check = await db.contentCheck.create({
      data: { tenantId: 1, itemId: r.itemId, question: `Szabály: IT-${Date.now()}`, state: "open", source: "rule" },
    });
    await service.submitReview(actorA(), r.versionId!, "approve");
    await service.submitReview(actorB(), r.versionId!, "approve");

    const waive = await service.setCheckState(actorA(), check.id, "waived", "nem releváns");
    expect(waive).toMatchObject({ ok: false, status: 403 });
    const resolve = await service.setCheckState(actorA(), check.id, "resolved", "megnéztem");
    expect(resolve).toMatchObject({ ok: false, status: 403 });

    const item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId } });
    expect(item.status).not.toBe("live");
    expect(item.liveVersionId).toBeNull();
  });

  it("setCheckState: a non-reviewer gets 403 and the check is NOT modified", async () => {
    const r = await newItem();
    const check = await db.contentCheck.create({
      data: { tenantId: 1, itemId: r.itemId, question: `Manual: IT-${Date.now()}`, state: "open", source: "manual" },
    });
    const nonReviewer = { tenantId: 1, kind: "user" as const, userId: userC };
    const res = await service.setCheckState(nonReviewer, check.id, "resolved", "válasz");
    expect(res).toMatchObject({ ok: false, status: 403 });

    const row = await db.contentCheck.findUniqueOrThrow({ where: { id: check.id } });
    expect(row.state).toBe("open");
    expect(row.answer).toBeNull();
  });

  it("setCheckState: a reviewer succeeds", async () => {
    const r = await newItem();
    const check = await db.contentCheck.create({
      data: { tenantId: 1, itemId: r.itemId, question: `Manual: IT-${Date.now()}`, state: "open", source: "manual" },
    });
    const res = await service.setCheckState(actorA(), check.id, "resolved", "megválaszolva");
    expect(res).toMatchObject({ ok: true });

    const row = await db.contentCheck.findUniqueOrThrow({ where: { id: check.id } });
    expect(row.state).toBe("resolved");
    expect(row.answer).toBe("megválaszolva");
  });

  it("rewrite request → claim → app version cycle", async () => {
    const r = await newItem();
    const rewrite = await service.submitReview(actorA(), r.versionId!, "rewrite", "please rewrite", "wording");
    expect(rewrite).toMatchObject({ ok: true, status: "rewrite_requested" });

    const claim1 = await service.claimItem(appActor, r.itemId);
    expect(claim1).toMatchObject({ ok: true, alreadyClaimed: false });
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId } })).status).toBe("ai_working");

    const claim2 = await service.claimItem(appActor, r.itemId);
    expect(claim2).toMatchObject({ ok: true, alreadyClaimed: true });

    const otherApp: ContentActor = { tenantId: 1, kind: "app", appSlug: "it-other" };
    const claim3 = await service.claimItem(otherApp, r.itemId);
    expect(claim3).toMatchObject({ ok: false, status: 409 });

    const noNote = await service.createVersion(appActor, r.itemId, { body: "rewritten", basedOnVersionId: r.versionId! });
    expect(noNote).toMatchObject({ ok: false, status: 400 });

    const wrongBase = await service.createVersion(appActor, r.itemId, {
      body: "rewritten", changeNote: "fixed per feedback", basedOnVersionId: r.versionId! + 999_999,
    });
    expect(wrongBase).toMatchObject({ ok: false, status: 409 });

    const valid = await service.createVersion(appActor, r.itemId, {
      body: "rewritten body", changeNote: "fixed per feedback", basedOnVersionId: r.versionId!,
    });
    expect(valid.ok).toBe(true);
    if (!valid.ok) return;
    expect(valid.number).toBe(2);

    const item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId } });
    expect(item.status).toBe("in_review");
    expect(item.claimedBy).toBeNull();
    expect(item.claimedAt).toBeNull();

    const version = await db.contentVersion.findUniqueOrThrow({ where: { id: valid.versionId } });
    expect(version.authorType).toBe("ai");

    const reviews = await db.contentReview.findMany({ where: { versionId: valid.versionId } });
    expect(reviews).toHaveLength(0);
  });

  it("a human edit after a claim beats the app's pending version (race rule)", async () => {
    const r = await newItem();
    await service.submitReview(actorA(), r.versionId!, "rewrite", "please rewrite", "wording");
    await service.claimItem(appActor, r.itemId);

    const humanVersion = await service.createVersion(actorA(), r.itemId, {
      body: "human fix", changeNote: null, basedOnVersionId: r.versionId!,
    });
    expect(humanVersion.ok).toBe(true);
    if (!humanVersion.ok) return;

    const appVersion = await service.createVersion(appActor, r.itemId, {
      body: "ai fix", changeNote: "note", basedOnVersionId: r.versionId!,
    });
    expect(appVersion).toMatchObject({ ok: false, status: 409 });

    const item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId } });
    expect(item.status).toBe("in_review");
    expect(item.currentVersionId).toBe(humanVersion.versionId);
  });

  it("releases a stale claim and rejects a version built on it", async () => {
    const r = await newItem();
    await service.submitReview(actorA(), r.versionId!, "changes", "fix typo", "wording");
    const claim = await service.claimItem(appActor, r.itemId);
    expect(claim.ok).toBe(true);

    const threeHoursAgo = new Date(Date.now() - 3 * 60 * 60 * 1000);
    await db.contentItem.update({ where: { id: r.itemId }, data: { claimedAt: threeHoursAgo } });

    const released = await service.releaseStaleClaims(1);
    expect(released).toBeGreaterThanOrEqual(1);

    const item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId } });
    expect(item.status).toBe("changes_requested"); // pre-claim status restored

    const staleClaim = await service.createVersion(appActor, r.itemId, {
      body: "too late", changeNote: "note", basedOnVersionId: r.versionId!,
    });
    expect(staleClaim).toMatchObject({ ok: false, status: 409 });
  });

  it("a live item keeps serving its old live version while a new one is in review", async () => {
    const r = await newItem("original live body");
    await service.submitReview(actorA(), r.versionId!, "approve");
    await service.submitReview(actorB(), r.versionId!, "approve");
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId } })).status).toBe("live");

    const v2 = await service.createVersion(actorA(), r.itemId, {
      body: "new body v2", changeNote: null, basedOnVersionId: r.versionId!,
    });
    expect(v2.ok).toBe(true);

    const item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId } });
    expect(item.status).toBe("in_review");
    expect(item.liveVersionId).toBe(r.versionId);

    const live = await service.getLive(1, { itemIds: [r.itemId] });
    expect(live).toHaveLength(1);
    expect(live[0].version.id).toBe(r.versionId);
    expect(live[0].version.body).toBe("original live body");
  });

  it("getQueue surfaces reviews with reviewer names and comments", async () => {
    const r = await newItem();
    await service.submitReview(actorA(), r.versionId!, "changes", "fix the CTA", "wording");

    const queue = await service.getQueue(1, ["changes_requested", "rewrite_requested"]);
    const entry = queue.find((q) => q.id === r.itemId);
    expect(entry).toBeTruthy();
    expect(entry!.status).toBe("changes_requested");
    const review = entry!.reviews.find((rv) => rv.comment === "fix the CTA");
    expect(review).toBeTruthy();
    expect(review!.reviewer).toBe("IT Aron");
  });

  it("concurrent createVersion calls: exactly one wins", async () => {
    const r = await newItem();
    await service.submitReview(actorA(), r.versionId!, "rewrite", "please rewrite", "wording");
    await service.claimItem(appActor, r.itemId);

    const [userResult, appResult] = await Promise.all([
      service.createVersion(actorA(), r.itemId, { body: "human concurrent", changeNote: null, basedOnVersionId: r.versionId! }),
      service.createVersion(appActor, r.itemId, { body: "ai concurrent", changeNote: "note", basedOnVersionId: r.versionId! }),
    ]);
    const results = [userResult, appResult];
    expect(results.filter((x) => x.ok)).toHaveLength(1);
    const failed = results.filter((x) => !x.ok);
    expect(failed).toHaveLength(1);
    expect(failed[0]).toMatchObject({ status: 409 });
  });

  it("archived items reject new versions", async () => {
    const r = await newItem();
    const archived = await service.archiveItem(actorA(), r.itemId);
    expect(archived).toMatchObject({ ok: true });
    expect((await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId } })).status).toBe("archived");

    const attempt = await service.createVersion(actorA(), r.itemId, { body: "too late", changeNote: null, basedOnVersionId: r.versionId! });
    expect(attempt).toMatchObject({ ok: false, status: 409 });
  });

  it("a review refused because the AI holds the claim leaves no review row", async () => {
    const r = await newItem();
    await service.submitReview(actorA(), r.versionId!, "rewrite", "írd újra", "wording");
    expect((await service.claimItem(appActor, r.itemId)).ok).toBe(true);
    const refused = await service.submitReview(actorB(), r.versionId!, "approve");
    expect(refused).toMatchObject({ ok: false, status: 409 });
    const rows = await db.contentReview.count({ where: { versionId: r.versionId!, reviewerUserId: userB } });
    expect(rows).toBe(0);
  });

  it("a review on an item whose claim went stale releases the claim first", async () => {
    const r = await newItem();
    await service.submitReview(actorA(), r.versionId!, "changes", "javítsd", "wording");
    await service.claimItem(appActor, r.itemId);
    await db.contentItem.update({ where: { id: r.itemId }, data: { claimedAt: new Date(Date.now() - 3 * 3600_000) } });
    const res = await service.submitReview(actorB(), r.versionId!, "approve");
    expect(res).toMatchObject({ ok: true, status: "changes_requested" });
  });

  it("with only one configured reviewer nothing goes live", async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: 1 }, select: { settings: true } });
    const saved = tenant.settings;
    try {
      await db.tenant.update({ where: { id: 1 }, data: { settings: { ...(saved as Record<string, unknown>), contentReviewers: [userA] } } });
      const r = await newItem();
      const res = await service.submitReview(actorA(), r.versionId!, "approve");
      expect(res).toMatchObject({ ok: true, status: "in_review", wentLive: false });
    } finally {
      await db.tenant.update({ where: { id: 1 }, data: { settings: saved as never } });
    }
  });

  it("createVersion by an app actor carries the base version's assets forward (positions 0..n, no duplicates)", async () => {
    const r = await newItem();
    await db.contentAsset.createMany({
      data: [
        { tenantId: 1, contentItemId: r.itemId, versionId: r.versionId!, position: 0, kind: "image", url: "a" },
        { tenantId: 1, contentItemId: r.itemId, versionId: r.versionId!, position: 1, kind: "file", url: "b" },
      ],
    });
    await service.submitReview(actorA(), r.versionId!, "rewrite", "please rewrite", "wording");
    await service.claimItem(appActor, r.itemId);
    const v2 = await service.createVersion(appActor, r.itemId, {
      body: "carried forward", changeNote: "note", basedOnVersionId: r.versionId!,
    });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    const assets = await db.contentAsset.findMany({
      where: { versionId: v2.versionId }, orderBy: { position: "asc" },
    });
    expect(assets.map((a) => a.url)).toEqual(["a", "b"]);
    expect(assets.map((a) => a.position)).toEqual([0, 1]);
  });

  it("createVersion with assets: [] leaves the new version without files", async () => {
    const r = await newItem();
    await db.contentAsset.createMany({
      data: [{ tenantId: 1, contentItemId: r.itemId, versionId: r.versionId!, position: 0, kind: "image", url: "a" }],
    });
    const v2 = await service.createVersion(actorA(), r.itemId, {
      body: "no files", changeNote: null, basedOnVersionId: r.versionId!, assets: [],
    });
    expect(v2.ok).toBe(true);
    if (!v2.ok) return;
    const assets = await db.contentAsset.findMany({ where: { versionId: v2.versionId } });
    expect(assets).toHaveLength(0);
  });

  it("countPendingForReviewer and getInbox(...).mine agree on WHICH items are pending", async () => {
    const { countPendingForReviewer, getInbox, pendingForReviewerWhere, bouncedByRuleWhere } =
      await import("./queries");

    // The badge and the "Rám vár" list must never disagree about an item. The
    // old version of this test compared a COUNT with a LIST LENGTH, which is
    // only equal while getInbox's 50-row page has not capped: it passed on CI's
    // clean database and failed on any fixture database carrying rows, and it
    // was flaky against a sibling integration file writing tenant 1 in
    // parallel. Cardinality was never the invariant. Membership is, and it is
    // immune to both paging and whatever else the database is holding.
    const plain = await newItem();
    const bounced = await newItem();
    await db.contentCheck.create({
      data: { tenantId: 1, itemId: bounced.itemId, question: `Szabály: IT-${Date.now()}`, state: "open", source: "rule" },
    });
    await db.contentItem.update({ where: { id: bounced.itemId }, data: { status: "rewrite_requested" } });

    const inbox = await getInbox(1, userA);
    const mineIds = inbox.mine.map((r) => r.id);
    // One awaiting a verdict, one the machine bounced. Both belong to `mine`.
    expect(mineIds).toContain(plain.itemId);
    expect(mineIds).toContain(bounced.itemId);

    // ...and the badge's `where` has to match those same two rows. This is the
    // half that catches a change to either where-builder: narrow one of them
    // and the item the list still shows stops being counted.
    for (const id of [plain.itemId, bounced.itemId]) {
      const counted = await db.contentItem.count({
        where: { id, OR: [pendingForReviewerWhere(1, userA), bouncedByRuleWhere(1)] },
      });
      expect(counted).toBe(1);
    }

    // A count can never be smaller than the page it is the total for.
    const count = await countPendingForReviewer(1, userA);
    expect(count).toBeGreaterThanOrEqual(inbox.mine.length);
  });

  it("countOpenDecisions and getDecisionQueue exclude a source: rule check — nobody can action it — but keep manual/decision/import ones", async () => {
    const { countOpenDecisions, getDecisionQueue } = await import("./queries");
    const before = await countOpenDecisions(1);

    const r = await newItem();
    await db.contentCheck.create({
      data: { tenantId: 1, itemId: r.itemId, question: `Szabály: IT-${Date.now()}`, state: "open", source: "rule" },
    });
    // A rule-only open check must NOT count as an open decision.
    expect(await countOpenDecisions(1)).toBe(before);
    const queueAfterRuleOnly = await getDecisionQueue(1);
    expect(queueAfterRuleOnly.total).toBe(
      queueAfterRuleOnly.aron.length + queueAfterRuleOnly.peter.length + queueAfterRuleOnly.either.length,
    );
    expect(
      [...queueAfterRuleOnly.aron, ...queueAfterRuleOnly.peter, ...queueAfterRuleOnly.either]
        .some((row) => row.item.id === r.itemId),
    ).toBe(false);

    // A manual check on the same item DOES count.
    await db.contentCheck.create({
      data: { tenantId: 1, itemId: r.itemId, question: `Kézi: IT-${Date.now()}`, state: "open", source: "manual" },
    });
    expect(await countOpenDecisions(1)).toBe(before + 1);
    const queueAfterManual = await getDecisionQueue(1);
    expect(
      [...queueAfterManual.aron, ...queueAfterManual.peter, ...queueAfterManual.either]
        .some((row) => row.item.id === r.itemId),
    ).toBe(true);
  });

  it("the same external_ref created concurrently yields one item", async () => {
    const ref = `it-ref-${Date.now()}`;
    const mk = () => service.createItem(appActor, {
      title: title(), body: "b", category: "other", channel: "other", contentType: "other", source: "it", externalRef: ref,
    });
    const [x, y] = await Promise.all([mk(), mk()]);
    if (x.ok) createdItemIds.push(x.itemId);
    if (y.ok) createdItemIds.push(y.itemId);
    expect(x.ok && y.ok).toBe(true);
    if (x.ok && y.ok) expect(x.itemId).toBe(y.itemId);
  });

  it("an open check keeps a dual-approved item out of live, and settling it flips it", async () => {
    const r = await newItem();
    await db.contentCheck.create({
      data: { tenantId: 1, itemId: r.itemId, question: `IT-check-${Date.now()}`, state: "open", source: "import" },
    });
    const a = await service.submitReview(actorA(), r.versionId!, "approve");
    const b = await service.submitReview(actorB(), r.versionId!, "approve");
    expect(a).toMatchObject({ ok: true });
    // Both approved, but the open check blocks live.
    expect(b).toMatchObject({ ok: true, status: "in_review", wentLive: false });
    let item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId }, select: { status: true, liveVersionId: true, wasLive: true } });
    expect(item).toMatchObject({ status: "in_review", liveVersionId: null, wasLive: false });

    const check = await db.contentCheck.findFirstOrThrow({ where: { itemId: r.itemId } });
    const settled = await service.setCheckState(actorA(), check.id, "resolved", "Áron válaszolt rá");
    expect(settled).toMatchObject({ ok: true, itemStatus: "live", wentLive: true });
    item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId }, select: { status: true, liveVersionId: true, wasLive: true } });
    expect(item).toMatchObject({ status: "live", wasLive: true });
    expect(item.liveVersionId).toBe(r.versionId);
  });

  it("archive of an ai_working item restores to where the AI took it from", async () => {
    const r = await newItem();
    await service.submitReview(actorA(), r.versionId!, "rewrite", "írd újra", "wording");
    await service.claimItem(appActor, r.itemId);
    expect(await service.archiveItem(actorA(), r.itemId)).toMatchObject({ ok: true });
    const restored = await service.restoreItem(actorA(), r.itemId);
    expect(restored).toMatchObject({ ok: true, status: "rewrite_requested" });
    // …and it is workable again: the AI can claim it.
    expect(await service.claimItem(appActor, r.itemId)).toMatchObject({ ok: true });
  });

  it("archiving an already archived item leaves its restore target alone", async () => {
    const r = await newItem();
    await service.archiveItem(actorA(), r.itemId);
    await service.archiveItem(actorA(), r.itemId);
    expect(await service.restoreItem(actorA(), r.itemId)).toMatchObject({ ok: true, status: "in_review" });
  });

  it("one reviewer plus a category set to one approval: solo approve goes live", async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: 1 }, select: { settings: true } });
    const saved = tenant.settings;
    try {
      await db.tenant.update({
        where: { id: 1 },
        data: { settings: { ...(saved as Record<string, unknown>), contentReviewers: [userA], contentApprovals: { byCategory: { other: 1 } } } },
      });
      const r = await newItem();
      const res = await service.submitReview(actorA(), r.versionId!, "approve");
      expect(res).toMatchObject({ ok: true, status: "live", wentLive: true });
    } finally {
      await db.tenant.update({ where: { id: 1 }, data: { settings: saved as never } });
    }
  });

  it("one reviewer but the category needs two: stays blocked and says nothing went live", async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: 1 }, select: { settings: true } });
    const saved = tenant.settings;
    try {
      await db.tenant.update({
        where: { id: 1 },
        data: { settings: { ...(saved as Record<string, unknown>), contentReviewers: [userA], contentApprovals: { byCategory: { other: 2 } } } },
      });
      const r = await newItem();
      const res = await service.submitReview(actorA(), r.versionId!, "approve");
      expect(res).toMatchObject({ ok: true, status: "in_review", wentLive: false });
      const item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId }, select: { liveVersionId: true } });
      expect(item.liveVersionId).toBeNull();
    } finally {
      await db.tenant.update({ where: { id: 1 }, data: { settings: saved as never } });
    }
  });

  it("solo approval never skips an open check", async () => {
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: 1 }, select: { settings: true } });
    const saved = tenant.settings;
    try {
      await db.tenant.update({
        where: { id: 1 },
        data: { settings: { ...(saved as Record<string, unknown>), contentReviewers: [userA], contentApprovals: { byCategory: { other: 1 } } } },
      });
      const r = await newItem();
      await db.contentCheck.create({ data: { tenantId: 1, itemId: r.itemId, question: `IT-solo-${Date.now()}`, state: "open", source: "import" } });
      const res = await service.submitReview(actorA(), r.versionId!, "approve");
      expect(res).toMatchObject({ ok: true, status: "in_review", wentLive: false });
    } finally {
      await db.tenant.update({ where: { id: 1 }, data: { settings: saved as never } });
    }
  });

  it("a version that breaks a rule goes back to the AI queue with an open rule check", async () => {
    const r = await newItem("Tisztelt Tóth Úr! 2021-ben együtt dolgoztunk a Lánchídon.", "email");
    const bad = await service.createVersion(actorA(), r.itemId, {
      body: "Tisztelt Uram!\n\nAz ár 250 000 Ft, és 72 órán belül kész a riport.\n\nÜdv",
      changeNote: null,
      basedOnVersionId: r.versionId!,
    });
    expect(bad.ok).toBe(true);
    if (!bad.ok) return;
    expect(bad.violations.map((v) => v.rule).sort()).toEqual(
      expect.arrayContaining(["forbidden_price", "forbidden_report_time"]),
    );
    const item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId }, select: { status: true } });
    expect(item.status).toBe("rewrite_requested");
    const checks = await db.contentCheck.findMany({ where: { itemId: r.itemId, source: "rule" } });
    expect(checks.length).toBeGreaterThanOrEqual(2);
    expect(checks.every((c) => c.state === "open")).toBe(true);
  });

  it("a rule violation blocks live even with every approval in place", async () => {
    const r = await newItem("Tisztelt Tóth Úr! 2021-ben együtt dolgoztunk a Lánchídon.", "email");
    const bad = await service.createVersion(actorA(), r.itemId, {
      body: "Az ár 250 000 Ft.", changeNote: null, basedOnVersionId: r.versionId!,
    });
    if (!bad.ok) throw new Error("setup");
    await service.submitReview(actorA(), bad.versionId, "approve");
    const second = await service.submitReview(actorB(), bad.versionId, "approve");
    expect(second).toMatchObject({ ok: true, wentLive: false });
    const item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId }, select: { liveVersionId: true } });
    expect(item.liveVersionId).toBeNull();
  });

  it("the next version auto-resolves the rule checks it fixed", async () => {
    // An email needs the tenant consent line, otherwise missing_footer fires (correctly).
    const tenant = await db.tenant.findUniqueOrThrow({ where: { id: 1 }, select: { settings: true } });
    const saved = tenant.settings;
    const FOOTER = "Ha nem szeretne tobb levelet kapni, valaszoljon annyit: leiratkozas.";
    await db.tenant.update({ where: { id: 1 }, data: { settings: { ...(saved as Record<string, unknown>), outreachFooter: FOOTER } } });
    const r = await newItem(`Tisztelt Tóth Úr! 2021-ben együtt dolgoztunk a Lánchídon.\n\n${FOOTER}`, "email");
    const bad = await service.createVersion(actorA(), r.itemId, {
      body: "Az ár 250 000 Ft.", changeNote: null, basedOnVersionId: r.versionId!,
    });
    if (!bad.ok) throw new Error("setup");
    const good = await service.createVersion(actorA(), r.itemId, {
      body: `Tisztelt Tóth Úr!\n\n2021-ben a Lánchíd-munkán dolgoztunk együtt. Van most olyan hídjuk, ahol nincs meg a vaskiosztás terve?\n\nÜdvözlettel\n\n${FOOTER}`,
      changeNote: null,
      basedOnVersionId: bad.versionId,
    });
    expect(good.ok).toBe(true);
    if (!good.ok) return;
    expect(good.violations).toEqual([]);
    const open = await db.contentCheck.count({ where: { itemId: r.itemId, source: "rule", state: "open" } });
    expect(open).toBe(0);
    const item = await db.contentItem.findUniqueOrThrow({ where: { id: r.itemId }, select: { status: true } });
    expect(item.status).toBe("in_review");
    await db.tenant.update({ where: { id: 1 }, data: { settings: saved as never } });
  });

  it("posting a version with internal: true corrects a wrongly-set item and resolves the rules it wrongly fired", async () => {
    const body = "Az ár 250 000 Ft. A méréshez röntgent használunk.";
    const created = await service.createItem(appActor, {
      title: title(), body, category: "script", channel: "other", contentType: "other",
      source: "it", internal: false,
    });
    if (!created.ok) throw new Error("setup");
    createdItemIds.push(created.itemId);
    expect(created.status).toBe("rewrite_requested");
    const openBefore = await db.contentCheck.findMany({
      where: { itemId: created.itemId, source: "rule", state: "open" },
    });
    expect(openBefore.length).toBeGreaterThan(0);

    const corrected = await service.createVersion(actorA(), created.itemId, {
      body, changeNote: "internal was set wrong at intake", basedOnVersionId: created.versionId!,
      internal: true,
    });
    expect(corrected.ok).toBe(true);
    if (!corrected.ok) return;
    expect(corrected.violations).toEqual([]);

    const item = await db.contentItem.findUniqueOrThrow({
      where: { id: created.itemId }, select: { internal: true, status: true },
    });
    expect(item.internal).toBe(true);
    expect(item.status).toBe("in_review");
    const openAfter = await db.contentCheck.count({
      where: { itemId: created.itemId, source: "rule", state: "open" },
    });
    expect(openAfter).toBe(0);
  });

  it("omitting internal on a version leaves the item's internal flag unchanged", async () => {
    const created = await service.createItem(appActor, {
      title: title(), body: "internal reference text", category: "other", channel: "other",
      contentType: "other", source: "it", internal: true,
    });
    if (!created.ok) throw new Error("setup");
    createdItemIds.push(created.itemId);

    const v2 = await service.createVersion(actorA(), created.itemId, {
      body: "internal reference text v2", changeNote: null, basedOnVersionId: created.versionId!,
    });
    expect(v2.ok).toBe(true);

    const item = await db.contentItem.findUniqueOrThrow({ where: { id: created.itemId }, select: { internal: true } });
    expect(item.internal).toBe(true);
  });

  // "Élő anyagok" is the SENDABLE library and round-one outreach is hand-sent
  // from its copy button, so an internal item appearing there is a route to a
  // real recipient — the same class of hole as the outreach slot (Vanda F1).
  // An internal item is also the one item the claim rules never check, which
  // is exactly why it must not be one click from a paste into Gmail.
  it("the live library never lists an internal item", async () => {
    const queries = await import("./queries");
    // A unique format scopes the assertion to just these two rows: the shared
    // fixture DB carries far more live items than one 50-row library page.
    const fmt = `it-lib-${Date.now()}`;
    const mk = async (internal: boolean) => {
      const c = await service.createItem(appActor, {
        title: title(), body: "library body", category: "other", channel: "other",
        contentType: "other", source: "it", internal, format: fmt,
      });
      if (!c.ok) throw new Error("setup");
      createdItemIds.push(c.itemId);
      // Straight to live: the library keys off liveVersionId, not the path taken.
      await db.contentItem.update({
        where: { id: c.itemId },
        data: { liveVersionId: c.versionId, status: "live", wasLive: true },
      });
      return c.itemId;
    };
    const internalId = await mk(true);
    const publicId = await mk(false);

    const { rows } = await queries.getLibrary(1, { format: fmt });
    const ids = rows.map((r) => r.id);
    expect(ids).toContain(publicId);
    expect(ids).not.toContain(internalId);
  });
});
