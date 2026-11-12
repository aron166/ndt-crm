// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// audit() defers through next/server after(), which needs a request scope.
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("server-only", () => ({}));

/**
 * The reply stop (C2, #208) inside the REAL transactions, against a throwaway local Postgres with
 * the full migrated schema (never production): the hub reply (recordOutcome) and the /outreach
 * and IMAP reply (recordDraftReply -> ingestLead). A company with open members in two campaigns:
 * person B replies in campaign X, person A sits queued in campaign Y.
 * Also: every outcome the code writes to campaign_events is accepted by its CHECK.
 * Skipped unless CAMPAIGNS_IT_DATABASE_URL is set and obviously local.
 */
const CONNECTION = process.env.CAMPAIGNS_IT_DATABASE_URL;
const enabled = Boolean(CONNECTION && (CONNECTION.includes("127.0.0.1") || CONNECTION.includes("localhost")));

describe.skipIf(!enabled)("reply stop on a real database", () => {
  let db: typeof import("@/lib/db")["db"];
  const tag = `it-reply-${Date.now()}`;
  const campaignIds: number[] = [];
  const companyIds: number[] = [];
  let peter = 0;

  /** Company with persons A and B, campaign X (B, sent touch 1 + queued touch 2) and Y (A, queued touch 1). */
  async function scene(n: string) {
    const co = await db.company.create({ data: { tenantId: 1, name: `${tag} ${n} Kft.` } });
    companyIds.push(co.id);
    const a = await db.person.create({ data: { tenantId: 1, firstName: "Anna", lastName: n, email: `anna.${n}@${tag}.example.test` } });
    const b = await db.person.create({ data: { tenantId: 1, firstName: "Béla", lastName: n, email: `bela.${n}@${tag}.example.test` } });
    for (const p of [a, b]) await db.contact.create({ data: { tenantId: 1, personId: p.id, companyId: co.id, email: p.email } });
    const mk = async (s: string) => {
      const c = await db.campaign.create({ data: { tenantId: 1, name: `${tag} ${n} ${s}`, slug: `${tag}-${n}-${s}`.toLowerCase(), kind: "sequence", status: "running", ownerUserId: peter } });
      campaignIds.push(c.id);
      await db.campaignStep.createMany({ data: [{ tenantId: 1, campaignId: c.id, position: 1, channel: "email" }, { tenantId: 1, campaignId: c.id, position: 2, channel: "email", waitDays: 3 }] });
      return c;
    };
    const x = await mk("x");
    const y = await mk("y");
    const mx = await db.campaignMember.create({ data: { tenantId: 1, campaignId: x.id, companyId: co.id, personId: b.id, state: "queued", stepPosition: 2 } });
    const my = await db.campaignMember.create({ data: { tenantId: 1, campaignId: y.id, companyId: co.id, personId: a.id, state: "queued", stepPosition: 1 } });
    const draft = (campaign: string, personId: number, step: number, status: string, email: string) => db.emailDraft.create({
      data: { tenantId: 1, companyId: co.id, personId, campaign, step, subject: "Tárgy", body: "Szöveg", status, toEmail: email,
        threadKey: `${campaign}:${co.id}`, ...(status === "sent" ? { sentAt: new Date(Date.now() - 86_400_000) } : {}) },
    });
    const sentB = await draft(x.slug, b.id, 1, "sent", b.email!);
    const queuedB = await draft(x.slug, b.id, 2, "approved", b.email!);
    const queuedA = await draft(y.slug, a.id, 1, "approved", a.email!);
    return { co, x, y, mx, my, sentB, queuedB, queuedA };
  }

  async function expectStopped(s: Awaited<ReturnType<typeof scene>>) {
    const st = async (id: number) => (await db.emailDraft.findUniqueOrThrow({ where: { id } })).status;
    expect(await st(s.sentB.id)).toBe("replied");
    expect(await st(s.queuedB.id)).toBe("cancelled");
    expect(await st(s.queuedA.id)).toBe("cancelled");
    // The other campaign's member keeps its state and gets no event.
    const my = await db.campaignMember.findUniqueOrThrow({ where: { id: s.my.id } });
    expect(my.state).toBe("queued");
    expect(await db.campaignEvent.count({ where: { memberId: s.my.id } })).toBe(0);
  }

  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    ({ db } = await import("@/lib/db"));
    peter = (await db.user.create({ data: { tenantId: 1, name: "IT Peter", email: `${tag}-peter@example.test`, passwordHash: "x" } })).id;
  });

  afterAll(async () => {
    if (!db) return;
    await db.campaign.deleteMany({ where: { id: { in: campaignIds } } });
    const leads = await db.lead.findMany({ where: { companyId: { in: companyIds } }, select: { id: true } });
    const leadIds = leads.map((l) => l.id);
    await db.task.deleteMany({ where: { leadId: { in: leadIds } } });
    await db.leadStatusHistory.deleteMany({ where: { leadId: { in: leadIds } } });
    await db.emailDraft.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.interaction.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.lead.deleteMany({ where: { id: { in: leadIds } } });
    const contacts = await db.contact.findMany({ where: { companyId: { in: companyIds } }, select: { personId: true } });
    await db.contact.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.person.deleteMany({ where: { id: { in: contacts.map((c) => c.personId) } } });
    await db.company.deleteMany({ where: { id: { in: companyIds } } });
    await db.user.deleteMany({ where: { id: peter } });
    await db.$disconnect();
  });

  it("hub reply (recordOutcome reply_positive): no constraint error, B's touch replied, every queued touch cancelled, A's member unchanged", async () => {
    const { recordOutcome } = await import("@/lib/campaigns/service");
    const s = await scene("hub");
    // Member X is on its e-mail step 2 for the reply plan; reply_positive without a replied-call step promotes.
    await db.campaignMember.update({ where: { id: s.mx.id }, data: { stepPosition: 1 } });
    const r = await recordOutcome({ tenantId: 1, userId: peter }, s.x.slug, { member_id: s.mx.id, outcome: "reply_positive" });
    expect(r).toMatchObject({ ok: true, member: { state: "promoted" } });
    await expectStopped(s);
    // Logged twice: refused, nothing more changes.
    const again = await recordOutcome({ tenantId: 1, userId: peter }, s.x.slug, { member_id: s.mx.id, outcome: "reply_positive" });
    expect(again).toMatchObject({ status: 409 });
    expect(await db.lead.count({ where: { companyId: s.co.id } })).toBe(1);
  });

  it("/outreach and IMAP reply (recordDraftReply -> ingestLead in its transaction): same stop, no constraint error", async () => {
    const { recordDraftReply } = await import("./record-reply");
    const s = await scene("imap");
    const r = await recordDraftReply(1, { draftId: s.sentB.id, replyType: null, appSlug: "it" });
    expect(r).toMatchObject({ ok: true, deduped: false });
    await expectStopped(s);
    expect(await db.lead.count({ where: { companyId: s.co.id } })).toBe(1);
  });

  it("every outcome the code writes to campaign_events passes the CHECK", async () => {
    const rules = await import("@/lib/campaigns/rules");
    // The lead-to-campaign map lands with #205; on this branch alone it is absent.
    const mapped = (rules as unknown as { LEAD_CALL_TO_CAMPAIGN_OUTCOME?: Record<string, string> }).LEAD_CALL_TO_CAMPAIGN_OUTCOME ?? {};
    const s = await scene("check");
    // recordOutcome writes input.outcome (any OUTCOME_KEYS: hub, /calls, applyOptOut, advanceOnSent);
    // advanceMembersForCall (#205) writes the mapped lead keys. Each insert is rolled back.
    const written = [...new Set([...rules.OUTCOME_KEYS, ...Object.values(mapped)])];
    expect(written.length).toBeGreaterThanOrEqual(11);
    for (const outcome of written) {
      await expect(db.$transaction(async (tx) => {
        await tx.campaignEvent.create({ data: { tenantId: 1, campaignId: s.x.id, memberId: s.mx.id, stepPosition: 1, outcome } });
        throw new Error("rollback");
      })).rejects.toThrow("rollback");
    }
    // Control: the CHECK is live, an unknown outcome is refused by Postgres.
    await expect(db.campaignEvent.create({ data: { tenantId: 1, campaignId: s.x.id, memberId: s.mx.id, stepPosition: 1, outcome: "replied_elsewhere" } }))
      .rejects.toThrow(/campaign_events_outcome_check|check constraint/i);
  });
});
