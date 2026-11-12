// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// audit() defers through next/server after(), which needs a request scope.
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

/**
 * Resend webhook effects against a real local Postgres with every migration applied (never production).
 * Skipped unless CAMPAIGNS_IT_DATABASE_URL is set and obviously local.
 *
 * Run: CAMPAIGNS_IT_DATABASE_URL=postgresql://postgres:pg@127.0.0.1:55462/postgres \
 *   npx vitest run src/lib/integrations/resend-webhook.integration.test.ts
 */
const CONNECTION = process.env.CAMPAIGNS_IT_DATABASE_URL;
const enabled = Boolean(CONNECTION && (CONNECTION.includes("127.0.0.1") || CONNECTION.includes("localhost")));

describe.skipIf(!enabled)("resend webhook (integration)", () => {
  let db: typeof import("@/lib/db")["db"];
  let proc: typeof import("./resend-webhook")["processResendEvent"];
  const tag = `it-rw-${Date.now()}`;
  const addr = `${tag}@example.test`;
  const eventIds = [`${tag}-b`, `${tag}-d`, `${tag}-u`];
  let companyId = 0, campaignId = 0, memberId = 0, draftId = 0;

  const fixture = (type: string, extra: Record<string, unknown> = {}) => ({
    type,
    created_at: "2026-11-22T23:41:12.126Z",
    data: {
      broadcast_id: "8b146471-e88e-4322-86af-016cd36fd216",
      created_at: "2026-11-22T23:41:11.894Z",
      email_id: "re_it_1",
      message_id: "<111-222-333@email.example.com>",
      from: "Acme <onboarding@resend.dev>",
      to: [addr],
      subject: "Sending this example",
      tags: { category: "confirm_email" },
      ...extra,
    },
  });

  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    ({ db } = await import("@/lib/db"));
    ({ processResendEvent: proc } = await import("./resend-webhook"));
    companyId = (await db.company.create({ data: { tenantId: 1, name: `${tag} Kft.` } })).id;
    const c = await db.campaign.create({
      data: { tenantId: 1, name: tag, slug: tag, kind: "sequence", status: "running", steps: { create: [{ position: 1, channel: "email" }] } },
    });
    campaignId = c.id;
    memberId = (await db.campaignMember.create({ data: { tenantId: 1, campaignId, companyId, state: "queued" } })).id;
    draftId = (await db.emailDraft.create({
      data: { tenantId: 1, companyId, campaign: tag, step: 1, subject: "s", body: "b", toEmail: addr, status: "sent", providerMessageId: "re_it_1", sentAt: new Date() },
    })).id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.emailProviderEvent.deleteMany({ where: { provider: "resend", eventId: { in: eventIds } } });
    await db.suppression.deleteMany({ where: { tenantId: 1, email: addr } });
    await db.emailDraft.deleteMany({ where: { id: draftId } });
    if (campaignId) await db.campaign.deleteMany({ where: { id: campaignId } }); // cascades members, steps, events
    await db.company.deleteMany({ where: { id: companyId } });
  });

  it("a permanent bounce suppresses once and moves the member to needs_email, even delivered twice", async () => {
    const bounce = fixture("email.bounced", { bounce: { message: "x", subType: "Suppressed", type: "Permanent" } });
    expect(await proc(1, eventIds[0], bounce)).toEqual({ duplicate: false, type: "email.bounced" });
    expect(await proc(1, eventIds[0], bounce)).toEqual({ duplicate: true, type: "email.bounced" });
    expect(await db.emailProviderEvent.count({ where: { provider: "resend", eventId: eventIds[0] } })).toBe(1);
    expect(await db.suppression.count({ where: { tenantId: 1, email: addr } })).toBe(1);
    expect((await db.campaignMember.findUniqueOrThrow({ where: { id: memberId } })).state).toBe("needs_email");
    expect((await db.emailDraft.findUniqueOrThrow({ where: { id: draftId } })).lastError).toBe("Visszapattant (Suppressed)");
  });

  it("delivered becomes one campaign event", async () => {
    await proc(1, eventIds[1], fixture("email.delivered"));
    expect(await db.campaignEvent.count({ where: { memberId, outcome: "email_delivered" } })).toBe(1);
  });

  it("an unknown type is stored and marked processed", async () => {
    await proc(1, eventIds[2], fixture("email.something_new"));
    const row = await db.emailProviderEvent.findFirstOrThrow({ where: { provider: "resend", eventId: eventIds[2] } });
    expect(row).toMatchObject({ eventType: "email.something_new", draftId });
    expect(row.processedAt).not.toBeNull();
  });
});
