// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";

// audit() defers through next/server after(), which needs a request scope.
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
const h = vi.hoisted(() => ({ n: 0, send: undefined as unknown as ReturnType<typeof import("vitest")["vi"]["fn"]> }));
vi.mock("@/lib/integrations/resend", () => ({
  sendEmail: (h.send = vi.fn(async () => ({ ok: true, id: `re_${++h.n}` }))),
}));

/**
 * Scheduled sending against a real local Postgres with every migration applied (never production).
 * Works in its own tenant, so it never touches tenant 1 or another test's rows.
 * Skipped unless CAMPAIGNS_IT_DATABASE_URL is set and obviously local.
 *
 * Run: CAMPAIGNS_IT_DATABASE_URL=postgresql://postgres:pg@127.0.0.1:55462/postgres \
 *   npx vitest run src/lib/campaigns/scheduled-send.integration.test.ts
 */
const CONNECTION = process.env.CAMPAIGNS_IT_DATABASE_URL;
const enabled = Boolean(CONNECTION && (CONNECTION.includes("127.0.0.1") || CONNECTION.includes("localhost")));

describe.skipIf(!enabled)("scheduled sending (integration)", () => {
  let db: typeof import("@/lib/db")["db"];
  let svc: typeof import("./service");
  let run: typeof import("./scheduled-send")["runScheduledSends"];
  const tag = `it-sched-${Date.now()}`;
  const NOW = new Date("2026-11-11T10:00:00Z"); // Wednesday 11:00 Budapest, inside the window
  const FOOTER = "Leiratkozás: válaszolj a levélre";
  let tenantId = 0, aron = 0, seq = 0;
  let aronCtx: { tenantId: number; userId: number };

  const setTenant = async (patch: Record<string, unknown>) => {
    const t = await db.tenant.findUniqueOrThrow({ where: { id: tenantId }, select: { settings: true } });
    await db.tenant.update({ where: { id: tenantId }, data: { settings: { ...(t.settings as object), ...patch } as never } });
  };

  async function mk(o: { n?: number; dailyCap?: number; on?: boolean; warmup?: string | null; phone?: string | null } = {}) {
    const i = ++seq;
    const sender = await db.user.create({
      data: {
        tenantId, name: `${tag} Sender ${i}`, email: `${tag}-s${i}@example.test`, passwordHash: "x",
        settings: { ...(o.phone === null ? {} : { phone: "+36 1 000 0000" }), ...(o.warmup === null ? {} : { warmupStartedOn: o.warmup ?? "2026-11-01" }) },
      },
    });
    const item = await db.contentItem.create({ data: { tenantId, channel: "email", contentType: "email", title: "T", body: "B", status: "live", source: "it", category: "email" } });
    const c = await svc.createCampaign(aronCtx, { name: `${tag} c${i}`, kind: "cold_email", daily_cap: o.dailyCap ?? 15, steps: [{ channel: "email", content_item_id: item.id }] });
    if ("error" in c) throw new Error(c.error);
    const n = o.n ?? 3;
    const rows = Array.from({ length: n }, (_, k) => ({ company_name: `${tag} firm ${i}-${k}`, email: `f${i}-${k}@firm.example.test` }));
    const added = await svc.addMembers(aronCtx, c.slug, { dry_run: false, batch: `b${i}`, rows });
    if ("error" in added) throw new Error(added.error);
    const ok = await svc.approveCampaign(aronCtx, c.slug);
    if ("error" in ok) throw new Error(ok.error);
    await db.campaign.update({ where: { id: c.id }, data: { senderUserId: sender.id, scheduledSending: o.on ?? true } });
    const members = await db.campaignMember.findMany({ where: { campaignId: c.id }, orderBy: { id: "asc" } });
    expect(members).toHaveLength(n);
    const draftIds: number[] = [];
    for (const m of members) {
      const d = await db.emailDraft.create({
        data: { tenantId, companyId: m.companyId, campaign: c.slug, step: 1, subject: "Tárgy", body: "Szia!", toEmail: `m${m.id}@firm.example.test`, status: "approved" },
      });
      draftIds.push(d.id);
    }
    return { id: c.id, slug: c.slug, senderId: sender.id, draftIds, members };
  }

  const go = async (slug: string, now = NOW) => {
    const r = await run(now, { tenantId });
    return r.campaigns.find((x) => x.slug === slug);
  };
  const sentCalls = () => h.send.mock.calls.length;
  const status = async (id: number) => (await db.emailDraft.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    process.env.ENCRYPTION_KEY = "ab".repeat(32);
    ({ db } = await import("@/lib/db"));
    svc = await import("./service");
    ({ runScheduledSends: run } = await import("./scheduled-send"));
    tenantId = (await db.tenant.create({ data: { name: tag, slug: tag } })).id;
    aron = (await db.user.create({ data: { tenantId, name: `${tag} Aron`, email: `${tag}-aron@example.test`, passwordHash: "x", role: "admin" } })).id;
    aronCtx = { tenantId, userId: aron };
    await db.tenant.update({ where: { id: tenantId }, data: { settings: { demoHosts: { aron } } } });
  });

  beforeEach(async () => {
    h.send.mockClear();
    await setTenant({ outreachFooter: FOOTER, inboxCheckedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() });
  });
  // Campaigns of earlier tests must not keep sending in later ones.
  // Earlier tests' sends must not fill the mailbox's warm-up cap of later ones: move them before every warm-up start.
  afterEach(async () => {
    await db.campaign.updateMany({ where: { tenantId }, data: { scheduledSending: false } });
    await db.emailDraft.updateMany({ where: { tenantId, sentAt: { not: null } }, data: { sentAt: new Date("2026-10-01T10:00:00Z") } });
  });

  afterAll(async () => {
    if (!db) return;
    const w = { tenantId };
    await db.emailDraft.deleteMany({ where: w });
    await db.campaign.deleteMany({ where: w }); // cascades members, steps, events
    await db.contentItem.deleteMany({ where: w });
    await db.interaction.deleteMany({ where: w });
    await db.suppression.deleteMany({ where: w });
    await db.contact.deleteMany({ where: w });
    await db.person.deleteMany({ where: w });
    await db.company.deleteMany({ where: w });
    await db.user.deleteMany({ where: w });
    await db.tenant.deleteMany({ where: { id: tenantId } });
    await db.$disconnect();
  });

  it("does nothing with no switched-on campaign, and with the switch off", async () => {
    expect(await run(NOW, { tenantId })).toEqual({ ok: true, campaigns: [] });
    const c = await mk({ on: false });
    expect(await go(c.slug)).toBeUndefined();
    expect(sentCalls()).toBe(0);
    expect(await status(c.draftIds[0])).toBe("approved");
  });

  it("switch on: exactly one send per call, the draft is sent and the member advances", async () => {
    const c = await mk();
    const r = await go(c.slug);
    expect(r).toMatchObject({ slug: c.slug, sentDraftId: c.draftIds[0], blocked: [] });
    expect(sentCalls()).toBe(1);
    const d = await db.emailDraft.findUniqueOrThrow({ where: { id: c.draftIds[0] } });
    expect(d).toMatchObject({ status: "sent", sentVia: "resend", senderUserId: c.senderId });
    expect(h.send.mock.calls[0][0]).toMatchObject({ idempotencyKey: `draft-${d.id}`, tenantId });
    const m = await db.campaignMember.findUniqueOrThrow({ where: { id: c.members[0].id } });
    expect(m.state).not.toBe("queued");
    expect(m.lastOutcome).toBe("email_sent");
    expect(await status(c.draftIds[1])).toBe("approved");
    expect((await go(c.slug))?.sentDraftId).toBe(c.draftIds[1]);
  });

  it("two concurrent calls send two different drafts, never the same one twice", async () => {
    const c = await mk();
    await Promise.all([run(NOW, { tenantId }), run(NOW, { tenantId })]);
    const keys = h.send.mock.calls.map((a) => (a[0] as { idempotencyKey: string }).idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect((await Promise.all(c.draftIds.map(status))).filter((s) => s === "sent")).toHaveLength(2);
  });

  it("with dailyCap 1, concurrent calls send exactly one", async () => {
    const c = await mk({ dailyCap: 1 });
    await Promise.all([run(NOW, { tenantId }), run(NOW, { tenantId })]);
    expect(sentCalls()).toBe(1);
    expect((await Promise.all(c.draftIds.map(status))).filter((s) => s === "sent")).toHaveLength(1);
  });

  it("repeated calls past the cap say cap_reached and send nothing more", async () => {
    const c = await mk({ dailyCap: 2, n: 4 });
    await go(c.slug); await go(c.slug);
    expect(sentCalls()).toBe(2);
    expect(await go(c.slug)).toMatchObject({ sentDraftId: null, blocked: ["cap_reached"] });
    expect(sentCalls()).toBe(2);
  });

  it("every send from the mailbox today counts against the warm-up cap, a hand-sent one too (Nate review of D)", async () => {
    const c = await mk({ warmup: "2026-11-11" }); // day 0: cap 10
    const other = await db.company.create({ data: { tenantId, name: `${tag} hand-sent` } });
    for (let k = 0; k < 10; k++) {
      await db.emailDraft.create({ data: { tenantId, companyId: other.id, campaign: `${tag}-manual`, step: k + 1 > 4 ? 4 : k + 1, subject: "S", body: "B", status: "sent", sentVia: "resend", sentAt: new Date(), ...(k > 3 ? { campaign: `${tag}-manual-${k}` } : {}) } });
    }
    expect(await go(c.slug)).toMatchObject({ sentDraftId: null, blocked: ["cap_reached"] });
    expect(sentCalls()).toBe(0);
  });

  it("warmup not started: missing or in the future", async () => {
    const a = await mk({ warmup: null });
    expect(await go(a.slug)).toMatchObject({ sentDraftId: null, blocked: ["warmup_not_started"] });
    const b = await mk({ warmup: "2026-11-12" }); // tomorrow
    expect(await go(b.slug)).toMatchObject({ sentDraftId: null, blocked: ["warmup_not_started"] });
    expect(sentCalls()).toBe(0);
  });

  it("stale inbox check, missing sender phone, missing footer: blocked", async () => {
    const c = await mk();
    await setTenant({ inboxCheckedAt: new Date(NOW.getTime() - 2 * 3_600_000).toISOString() });
    expect((await go(c.slug))?.blocked).toEqual(["inbox_check_stale"]);
    await setTenant({ inboxCheckedAt: new Date(NOW.getTime() - 60_000).toISOString(), outreachFooter: "  " });
    expect((await go(c.slug))?.blocked).toEqual(["no_footer"]);
    await setTenant({ outreachFooter: FOOTER });
    await db.user.update({ where: { id: c.senderId }, data: { settings: { warmupStartedOn: "2026-11-01" } } });
    expect((await go(c.slug))?.blocked).toEqual(["sender_profile_incomplete"]);
    expect(sentCalls()).toBe(0);
  });

  it("outside the window nothing goes", async () => {
    const c = await mk();
    expect(await go(c.slug, new Date("2026-11-14T10:00:00Z"))).toMatchObject({ sentDraftId: null, blocked: expect.arrayContaining(["outside_send_window"]) });
    expect(sentCalls()).toBe(0);
  });

  it("a member added after approval (hash drift) blocks the campaign", async () => {
    const c = await mk();
    const co = await db.company.create({ data: { tenantId, name: `${tag} late` } });
    await db.campaignMember.create({ data: { tenantId, campaignId: c.id, companyId: co.id } });
    expect(await go(c.slug)).toMatchObject({ sentDraftId: null, blocked: ["approval_changed"] });
    expect(sentCalls()).toBe(0);
  });

  it("a suppressed recipient gets a lastError and the next draft is sent", async () => {
    const c = await mk();
    await db.suppression.create({ data: { tenantId, email: `m${c.members[0].id}@firm.example.test`, requestedAt: new Date("2026-11-01") } });
    expect(await go(c.slug)).toMatchObject({ sentDraftId: c.draftIds[1] });
    const first = await db.emailDraft.findUniqueOrThrow({ where: { id: c.draftIds[0] } });
    expect(first.status).toBe("approved");
    expect(first.lastError).toBeTruthy();
  });

  it("a draft whose member is no longer queued is skipped with a lastError", async () => {
    const c = await mk({ n: 2 });
    await db.campaignMember.update({ where: { id: c.members[0].id }, data: { state: "declined" } });
    expect(await go(c.slug)).toMatchObject({ sentDraftId: c.draftIds[1] });
    expect((await db.emailDraft.findUniqueOrThrow({ where: { id: c.draftIds[0] } })).lastError).toBeTruthy();
  });

  it("three failed sends in the last hour stop and pause the campaign instead of burning the queue (Vanda #200-1)", async () => {
    const c = await mk({ n: 5 });
    h.send.mockResolvedValue({ ok: false, error: "Nem sikerült kapcsolódni a Resendhez." });
    for (let k = 0; k < 3; k++) await go(c.slug);
    expect(sentCalls()).toBe(3);
    expect(await go(c.slug)).toMatchObject({ sentDraftId: null, blocked: expect.arrayContaining(["send_failing"]) });
    expect(sentCalls()).toBe(3);
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("paused");
    expect((await Promise.all(c.draftIds.map(status))).filter((x) => x === "approved")).toHaveLength(2);
    h.send.mockImplementation(async () => ({ ok: true, id: `re_${++h.n}` }));
  });

  it("a company that replied in another campaign gets no cold e-mail from this one (Vanda #200-6)", async () => {
    const c = await mk({ n: 2 });
    const co = c.members[0].companyId;
    await db.emailDraft.create({ data: { tenantId, companyId: co, campaign: `${tag}-other`, step: 1, subject: "s", body: "b", status: "replied", sentVia: "resend", sentAt: new Date("2026-10-01T10:00:00Z") } });
    const r = await go(c.slug);
    expect(r?.sentDraftId).toBe(c.draftIds[1]);
    expect(await status(c.draftIds[0])).toBe("approved");
  });

  it("1 bounce over 10 sent drafts stops the campaign and pauses it", async () => {
    const c = await mk({ n: 1 });
    const cos = await Promise.all(Array.from({ length: 10 }, (_, k) => db.company.create({ data: { tenantId, name: `${tag} old ${seq}-${k}` } })));
    for (const co of cos) {
      await db.emailDraft.create({ data: { tenantId, companyId: co.id, campaign: c.slug, step: 1, subject: "s", body: "b", status: "sent", sentVia: "resend", sentAt: new Date("2026-11-05T09:00:00Z") } });
    }
    await db.campaignEvent.create({ data: { tenantId, campaignId: c.id, memberId: c.members[0].id, stepPosition: 1, outcome: "bounce" } });
    expect(await go(c.slug)).toMatchObject({ sentDraftId: null, blocked: expect.arrayContaining(["bounce_stop"]) });
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("paused");
    expect(sentCalls()).toBe(0);
  });

  it("a paused campaign with the switch on is skipped; a failed draft is never picked", async () => {
    const p = await mk();
    await db.campaign.update({ where: { id: p.id }, data: { status: "paused" } });
    expect(await go(p.slug)).toBeUndefined();
    const f = await mk({ n: 1 });
    await db.emailDraft.update({ where: { id: f.draftIds[0] }, data: { status: "failed" } });
    expect(await go(f.slug)).toMatchObject({ sentDraftId: null });
    expect(sentCalls()).toBe(0);
  });
});
