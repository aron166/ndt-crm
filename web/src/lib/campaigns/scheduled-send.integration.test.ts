// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, afterEach, beforeEach, vi } from "vitest";
import { RESEND_PROSPECT_REFUSAL } from "./send-route";

// audit() defers through next/server after(), which needs a request scope.
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
type Fn = ReturnType<typeof import("vitest")["vi"]["fn"]>;
const DEFAULT_CFG = { host: "127.0.0.1", port: 2525, secure: false, user: "aron@betonradar.test", pass: "x", dailyCap: 30 };
const h = vi.hoisted(() => ({
  n: 0,
  send: undefined as unknown as Fn,
  mbox: undefined as unknown as Fn,
  cfg: null as null | { dailyCap: number; [k: string]: unknown },
}));
vi.mock("@/lib/integrations/resend", () => ({
  sendEmail: (h.send = vi.fn(async () => ({ ok: true, id: `re_${++h.n}` }))),
}));
vi.mock("@/lib/integrations/mailbox", () => ({
  mailboxConfig: () => h.cfg,
  sendViaMailbox: (...a: unknown[]) => (h.mbox as (...x: unknown[]) => unknown)(...a),
}));
h.mbox = vi.fn(async () => ({ ok: true, id: `<mb_${++h.n}@test>` }));

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

  async function mk(o: {
    n?: number; dailyCap?: number; on?: boolean; warmup?: string | null; phone?: string | null;
    route?: "resend" | "mailbox" | "export"; kind?: "cold_email" | "sequence"; rows?: Record<string, unknown>[];
  } = {}) {
    const i = ++seq;
    const sender = await db.user.create({
      data: {
        tenantId, name: `${tag} Sender ${i}`, email: `${tag}-s${i}@example.test`, passwordHash: "x",
        settings: { ...(o.phone === null ? {} : { phone: "+36 1 000 0000" }), ...(o.warmup === null ? {} : { warmupStartedOn: o.warmup ?? "2026-11-01" }) },
      },
    });
    const item = await db.contentItem.create({ data: { tenantId, channel: "email", contentType: "email", title: "T", body: "B", status: "live", source: "it", category: "email" } });
    const c = await svc.createCampaign(aronCtx, { name: `${tag} c${i}`, kind: o.kind ?? "cold_email", daily_cap: o.dailyCap ?? 15, steps: [{ channel: "email", content_item_id: item.id }] });
    if ("error" in c) throw new Error(c.error);
    const route = o.route ?? "resend";
    const n = o.rows?.length ?? o.n ?? 3;
    const rows = (o.rows ?? Array.from({ length: n }, (_, k) => ({ company_name: `${tag} firm ${i}-${k}`, email: `f${i}-${k}@firm.example.test` }))) as never[];
    const added = await svc.addMembers(aronCtx, c.slug, { dry_run: false, batch: `b${i}`, rows });
    if ("error" in added) throw new Error(added.error);
    // Resend refuses prospect lists, so the Resend tests run on a lead audience.
    if (route === "resend") await db.campaign.update({ where: { id: c.id }, data: { audience: { source: "leads_by_stage", stages: ["new"] } } });
    else {
      const r = await svc.updateCampaign(aronCtx, c.slug, { send_route: route });
      if ("error" in r) throw new Error(r.error);
    }
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

  // The clock (Date only) stands at the tick, so sentAt written by the sender is the tick's time: the mailbox cap and
  // spacing compare it with `now`.
  const go = async (slug: string, now = NOW) => {
    vi.setSystemTime(now);
    const r = await run(now, { tenantId });
    return r.campaigns.find((x) => x.slug === slug);
  };
  const goAll = async (now = NOW) => { vi.setSystemTime(now); return (await run(now, { tenantId })).campaigns; };
  const mboxCalls = () => h.mbox.mock.calls.length;
  const sentCalls = () => h.send.mock.calls.length;
  const status = async (id: number) => (await db.emailDraft.findUniqueOrThrow({ where: { id } })).status;

  beforeAll(async () => {
    vi.useFakeTimers({ toFake: ["Date"] });
    vi.setSystemTime(NOW);
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
    h.cfg = { ...DEFAULT_CFG };
    h.mbox.mockReset();
    h.mbox.mockImplementation(async () => ({ ok: true, id: `<mb_${++h.n}@test>` }));
    await setTenant({ outreachFooter: FOOTER, inboxCheckedAt: new Date(NOW.getTime() - 5 * 60_000).toISOString() });
  });
  // Campaigns of earlier tests must not keep sending in later ones.
  // Earlier tests' sends must not fill the mailbox's warm-up cap of later ones: move them before every warm-up start.
  afterEach(async () => {
    await db.campaign.updateMany({ where: { tenantId }, data: { scheduledSending: false } });
    await db.emailDraft.updateMany({ where: { tenantId, sentAt: { not: null } }, data: { sentAt: new Date("2026-10-01T10:00:00Z") } });
  });

  afterAll(async () => {
    vi.useRealTimers();
    if (!db) return;
    const w = { tenantId };
    await db.emailDraft.deleteMany({ where: w });
    await db.campaign.deleteMany({ where: w }); // cascades members, steps, events
    await db.contentItem.deleteMany({ where: w });
    await db.interaction.deleteMany({ where: w });
    await db.lead.deleteMany({ where: w });
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
    expect(h.send.mock.calls[0][0]).toMatchObject({ idempotencyKey: expect.stringMatching(new RegExp(`^draft-${d.id}-[0-9a-f]{16}$`)), tenantId });
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

  it("a prospect e-mail campaign is refused on Resend with the one-sentence reason; mailbox and export approve; a call-only campaign approves on Resend", async () => {
    const item = await db.contentItem.create({ data: { tenantId, channel: "email", contentType: "email", title: "T", body: "B", status: "live", source: "it", category: "email" } });
    const bare = async (kind: "cold_email" | "cold_call", step: Record<string, unknown>, route?: "mailbox" | "export") => {
      const i = ++seq;
      const c = await svc.createCampaign(aronCtx, { name: `${tag} r1-${i}`, kind, daily_cap: 15, steps: [step as never] });
      if ("error" in c) throw new Error(c.error);
      const row = kind === "cold_call" ? { phone: "+36 30 000 0000" } : { email: `r1-${i}@firm.example.test` };
      const added = await svc.addMembers(aronCtx, c.slug, { dry_run: false, batch: `r1-${i}`, rows: [{ company_name: `${tag} r1 firm ${i}`, ...row }] });
      if ("error" in added) throw new Error(added.error);
      if (route) {
        const u = await svc.updateCampaign(aronCtx, c.slug, { send_route: route });
        if ("error" in u) throw new Error(u.error);
      }
      return c.slug;
    };
    const email = { channel: "email", content_item_id: item.id };
    expect(await svc.approveCampaign(aronCtx, await bare("cold_email", email))).toMatchObject({ error: RESEND_PROSPECT_REFUSAL, status: 409 });
    expect(await svc.approveCampaign(aronCtx, await bare("cold_email", email, "mailbox"))).not.toHaveProperty("error");
    expect(await svc.approveCampaign(aronCtx, await bare("cold_email", email, "export"))).not.toHaveProperty("error");
    expect(await svc.approveCampaign(aronCtx, await bare("cold_call", { channel: "call" }))).not.toHaveProperty("error");
  });

  it("the mailbox cap holds across separate calls and the rest waits for the next day", async () => {
    h.cfg!.dailyCap = 2;
    const c = await mk({ route: "mailbox", dailyCap: 15, n: 4 });
    const min = (m: number) => new Date(NOW.getTime() + m * 60_000);
    await go(c.slug); await go(c.slug, min(4));
    expect(mboxCalls()).toBe(2);
    expect((await go(c.slug, min(8)))?.blocked).toContain("cap_reached");
    expect(mboxCalls()).toBe(2);
    expect((await Promise.all(c.draftIds.map(status))).filter((x) => x === "approved")).toHaveLength(2);
    const next = new Date(NOW.getTime() + 24 * 3_600_000); // Thursday 11:00 Budapest
    await setTenant({ inboxCheckedAt: new Date(next.getTime() - 5 * 60_000).toISOString() });
    expect((await go(c.slug, next))?.sentDraftId).toBeTruthy();
    expect(mboxCalls()).toBe(3);
  });

  it("two concurrent ticks never pass the mailbox cap", async () => {
    h.cfg!.dailyCap = 1;
    const c = await mk({ route: "mailbox", n: 3 });
    await Promise.all([go(c.slug), go(c.slug)]);
    expect(mboxCalls()).toBe(1);
  });

  it("cap reached mid-batch across two campaigns on the same mailbox", async () => {
    h.cfg!.dailyCap = 3;
    const a = await mk({ route: "mailbox", n: 3 });
    const b = await mk({ route: "mailbox", n: 3 });
    let last: Awaited<ReturnType<typeof goAll>> = [];
    for (let k = 0; k < 5; k++) last = await goAll(new Date(NOW.getTime() + k * 4 * 60_000));
    expect(mboxCalls()).toBe(3);
    for (const c of [a, b]) expect(last.find((x) => x.slug === c.slug)?.blocked).toContain("cap_reached");
    expect((await Promise.all([...a.draftIds, ...b.draftIds].map(status))).filter((x) => x === "approved")).toHaveLength(3);
  });

  it("a second tick at the same instant waits for the mailbox spacing", async () => {
    const c = await mk({ route: "mailbox", n: 2 });
    await go(c.slug);
    expect((await go(c.slug))?.blocked).toContain("mailbox_spacing");
    expect(mboxCalls()).toBe(1);
  });

  it("SMTP auth failure pauses the campaign and marks nothing sent", async () => {
    const c = await mk({ route: "mailbox", n: 2 });
    h.mbox.mockImplementation(async () => ({ ok: false, auth: true, error: "A postafiók nem fogadta el a belépést" }));
    expect((await go(c.slug))?.blocked).toContain("mailbox_auth_failed");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("paused");
    const d = await db.emailDraft.findUniqueOrThrow({ where: { id: c.draftIds[0] } });
    expect(d).toMatchObject({ status: "approved", sentAt: null, sentVia: null });
    expect(d.lastError).toBeTruthy();
    const m = await db.campaignMember.findUniqueOrThrow({ where: { id: c.members[0].id } });
    expect(m).toMatchObject({ state: "queued", stepPosition: 1 });
    await go(c.slug, new Date(NOW.getTime() + 4 * 60_000));
    expect(mboxCalls()).toBe(1);
  });

  it("mailbox off, export route and a Resend prospect campaign send nothing", async () => {
    const m = await mk({ route: "mailbox" });
    h.cfg = null;
    expect((await go(m.slug))?.blocked).toContain("mailbox_off");
    await db.campaign.update({ where: { id: m.id }, data: { scheduledSending: false } }); // else it sends once the config is back
    h.cfg = { ...DEFAULT_CFG };
    const e = await mk({ route: "export" });
    expect((await go(e.slug))?.blocked).toContain("export_route");
    const r = await mk({ route: "mailbox" });
    const row = await db.campaign.findUniqueOrThrow({ where: { id: r.id }, select: { audience: true } });
    await db.campaign.update({ where: { id: r.id }, data: { audience: { ...(row.audience as object), route: "resend" } as never } });
    expect((await go(r.slug))?.blocked).toContain("resend_prospect");
    expect(mboxCalls()).toBe(0);
    expect(sentCalls()).toBe(0);
  });

  it("the mailbox route skips the Resend warm-up and sends plain text from the sender's mailbox", async () => {
    const c = await mk({ route: "mailbox", warmup: null, n: 1 });
    expect(await go(c.slug)).toMatchObject({ sentDraftId: c.draftIds[0], blocked: [] });
    expect(sentCalls()).toBe(0);
    expect(mboxCalls()).toBe(1);
    const [cfg, input] = h.mbox.mock.calls[0] as [unknown, { to: string; text: string }];
    expect(cfg).toEqual(DEFAULT_CFG);
    expect(input.to).toBe(`m${c.members[0].id}@firm.example.test`);
    expect(input.text.trimEnd().endsWith(FOOTER)).toBe(true);
    expect(await db.emailDraft.findUniqueOrThrow({ where: { id: c.draftIds[0] } })).toMatchObject({ status: "sent", sentVia: "mailbox" });
  });

  it("the export holds only queued members with an address, marking skips them, and the scheduler then sends them nothing", async () => {
    const rows = [
      ...[0, 1, 2, 3].map((k) => ({ company_name: `${tag} x firm ${k}`, person_name: `Teszt Elek${k}`, email: `x${seq}-${k}@firm.example.test` })),
      { company_name: `${tag} x nomail`, phone: "+36 30 000 0000" },
    ];
    const c = await mk({ route: "mailbox", rows });
    await db.campaignMember.update({ where: { id: c.members[0].id }, data: { state: "done" } });
    const ex = await svc.exportQueued(aronCtx, c.slug);
    if (!("ok" in ex)) throw new Error(ex.error);
    expect(ex.memberIds).toHaveLength(3);
    expect(ex.memberIds).not.toContain(c.members[0].id);
    const lines = ex.csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean);
    expect(lines[0]).toBe("email,first_name,last_name,company_name,opener,segment,tender,source_url");
    expect(lines).toHaveLength(4);
    expect(await svc.markExported(aronCtx, c.slug, ex.memberIds)).toEqual({ ok: true, marked: 3 });
    const after = await db.campaignMember.findMany({ where: { id: { in: ex.memberIds } } });
    for (const m of after) expect(m).toMatchObject({ state: "excluded", lastOutcome: "exported" });
    await go(c.slug); await go(c.slug, new Date(NOW.getTime() + 4 * 60_000));
    expect(mboxCalls()).toBe(0);
  });

  it("a company mailbox with no person name exports with empty names", async () => {
    const c = await mk({ route: "mailbox", rows: [{ company_name: `${tag} info firm`, email: "info@firm.example.test" }] });
    const ex = await svc.exportQueued(aronCtx, c.slug);
    if (!("ok" in ex)) throw new Error(ex.error);
    const line = ex.csv.replace(/^﻿/, "").split(/\r?\n/).filter(Boolean).find((l) => l.includes("info@"));
    expect(line).toMatch(/^"?info@[^",]+"?,,,/);
    // The audit names the campaign and exactly who left in the file (Vanda #218-4).
    const { audit } = await import("@/lib/audit");
    expect(audit).toHaveBeenCalledWith("campaign", c.id, "update", null,
      { exported: { campaignId: c.id, memberIds: ex.memberIds, csvSha256: expect.stringMatching(/^[0-9a-f]{64}$/) } }, expect.anything());
  });

  it("the hand send path refuses a running prospect campaign on Resend", async () => {
    const c = await mk({ route: "mailbox", n: 1 });
    expect(await svc.campaignSendBlock(tenantId, c.slug)).toBe(RESEND_PROSPECT_REFUSAL);
    expect(await svc.campaignSendBlock(tenantId, c.slug, "resend")).toBe(RESEND_PROSPECT_REFUSAL);
    expect(await svc.campaignSendBlock(tenantId, c.slug, "mailbox")).toBeNull();
  });

  it("a plain member cannot export or mark", async () => {
    const c = await mk({ route: "mailbox", n: 1 });
    const u = await db.user.create({ data: { tenantId, name: `${tag} Member`, email: `${tag}-member@example.test`, passwordHash: "x", role: "member" } });
    const ctx = { tenantId, userId: u.id };
    expect(await svc.exportQueued(ctx, c.slug)).toMatchObject({ status: 403 });
    expect(await svc.markExported(ctx, c.slug, [c.members[0].id])).toMatchObject({ status: 403 });
  });

  // Export exclusions: the export lists only members the send path could e-mail today.
  const exportOnly = async (c: Awaited<ReturnType<typeof mk>>, keep: number) => {
    const ex = await svc.exportQueued(aronCtx, c.slug);
    if (!("ok" in ex)) throw new Error(ex.error);
    expect(ex.memberIds).toEqual([c.members[keep].id]);
    expect(ex.csv.replace(/^\uFEFF/, "").split(/\r?\n/).filter(Boolean)).toHaveLength(2);
    expect((ex as { excluded?: number }).excluded).toBe(1);
  };

  it("X1: export leaves out a suppressed address", async () => {
    const c = await mk({ route: "mailbox", n: 2 });
    const addr = `f${seq}-0@firm.example.test`;
    await db.suppression.create({ data: { tenantId, email: addr, requestedAt: new Date("2026-11-01") } });
    await exportOnly(c, 1);
  });

  it("X2: export leaves out a company with an open lead", async () => {
    const c = await mk({ route: "mailbox", n: 2 });
    await db.lead.create({ data: { tenantId, companyId: c.members[0].companyId, outcome: "open", convertedDealId: null } });
    await exportOnly(c, 1);
  });

  it("X3: export leaves out a company that replied", async () => {
    const c = await mk({ route: "mailbox", n: 2 });
    await db.emailDraft.create({ data: { tenantId, companyId: c.members[0].companyId, campaign: `${tag}-other`, step: 1, subject: "s", body: "b", status: "replied", sentVia: "resend", sentAt: new Date("2026-10-01T10:00:00Z") } });
    await exportOnly(c, 1);
  });

  it("X4: export leaves out a member not yet eligible", async () => {
    const c = await mk({ route: "mailbox", n: 2 });
    await db.campaignMember.update({ where: { id: c.members[0].id }, data: { nextEligibleOn: new Date("2026-11-20") } });
    await exportOnly(c, 1);
  });

  it("X5: export leaves out a member on a call step", async () => {
    const c = await mk({ route: "mailbox", n: 2, kind: "sequence" });
    await db.campaignStep.create({ data: { tenantId, campaignId: c.id, position: 2, channel: "call", waitDays: 2 } });
    await db.campaignMember.update({ where: { id: c.members[0].id }, data: { stepPosition: 2 } });
    await exportOnly(c, 1);
  });

  it("A: a prospect campaign already running on Resend with the schedule on sends nothing after deploy and keeps its queue", async () => {
    const c = await mk({ route: "resend" });
    await db.campaign.update({ where: { id: c.id }, data: { audience: null as never } });
    const row = await db.campaign.findUniqueOrThrow({
      where: { id: c.id },
      select: { id: true, dailyCap: true, outboundAutomations: true, audience: true, steps: { select: { position: true, channel: true, waitDays: true, audienceRule: true, contentItemId: true } } },
    });
    await db.campaign.update({ where: { id: c.id }, data: { approvedHash: await svc.approvalHashNow(tenantId, row) } });
    expect((await go(c.slug))?.blocked).toContain("resend_prospect");
    expect(sentCalls()).toBe(0);
    expect(mboxCalls()).toBe(0);
    for (const id of c.draftIds) expect(await status(id)).toBe("approved");
    const ms = await db.campaignMember.findMany({ where: { campaignId: c.id } });
    for (const m of ms) expect(m.state).toBe("queued");
    expect((await db.campaign.findUniqueOrThrow({ where: { id: c.id } })).status).toBe("running");
  });

  it("B: the hand send on a mailbox-route prospect campaign is refused", async () => {
    const { prepareDraftSend } = await import("@/lib/outreach/send-draft");
    const c = await mk({ route: "mailbox", n: 1 });
    const draft = await db.emailDraft.findUniqueOrThrow({ where: { id: c.draftIds[0] } });
    expect(await prepareDraftSend(tenantId, draft)).toEqual({ ok: false, error: RESEND_PROSPECT_REFUSAL });
    expect(await status(c.draftIds[0])).toBe("approved");
  });
});
