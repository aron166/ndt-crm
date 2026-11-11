// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";

// audit() defers through next/server after(), which needs a request scope.
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));

/**
 * Campaigns slice 1 against a real local Postgres with the migration applied (never production).
 * Skipped unless CAMPAIGNS_IT_DATABASE_URL is set and obviously local.
 *
 * Run: CAMPAIGNS_IT_DATABASE_URL=postgresql://postgres:pg@127.0.0.1:55442/ndt_crm \
 *   npx vitest run src/lib/campaigns/service.integration.test.ts
 */
const CONNECTION = process.env.CAMPAIGNS_IT_DATABASE_URL;
const enabled = Boolean(CONNECTION && (CONNECTION.includes("127.0.0.1") || CONNECTION.includes("localhost")));

describe.skipIf(!enabled)("campaigns service (integration)", () => {
  let db: typeof import("@/lib/db")["db"];
  let svc: typeof import("./service");
  let analytics: typeof import("./analytics");
  const tag = `it-${Date.now()}`;
  let aron = 0, peter = 0, campaignId = 0, slug = "";
  const companyIds: number[] = [];
  let prevSettings: unknown = null;
  let openLeadId = 0;

  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    ({ db } = await import("@/lib/db"));
    svc = await import("./service");
    analytics = await import("./analytics");
    await db.user.deleteMany({ where: { email: { in: ["it-camp-aron@example.test", "it-camp-peter@example.test"] } } });
    aron = (await db.user.create({ data: { tenantId: 1, name: "IT Aron", email: "it-camp-aron@example.test", passwordHash: "x", role: "admin" } })).id;
    peter = (await db.user.create({ data: { tenantId: 1, name: "IT Peter", email: "it-camp-peter@example.test", passwordHash: "x" } })).id;
    const t = await db.tenant.findUniqueOrThrow({ where: { id: 1 }, select: { settings: true } });
    prevSettings = t.settings;
    await db.tenant.update({ where: { id: 1 }, data: { settings: { ...(t.settings as object | null), demoHosts: { aron, peter } } } });
    // An existing company with a contact who has a phone; one with an open lead.
    const a = await db.company.create({ data: { tenantId: 1, name: `${tag} Alfa Kft.` } });
    const p = await db.person.create({ data: { tenantId: 1, firstName: "Teszt", lastName: "Alfa", phone: "+36 1 000 0001" } });
    await db.contact.create({ data: { tenantId: 1, personId: p.id, companyId: a.id, phone: "+36 1 000 0001" } });
    const b = await db.company.create({ data: { tenantId: 1, name: `${tag} Béta Kft.` } });
    openLeadId = (await db.lead.create({ data: { tenantId: 1, companyId: b.id, status: "new" } })).id;
    companyIds.push(a.id, b.id);
  });

  afterAll(async () => {
    if (!db) return;
    if (campaignId) await db.campaign.deleteMany({ where: { id: campaignId } }); // cascades members, steps, events
    const cos = await db.company.findMany({ where: { tenantId: 1, name: { startsWith: tag } }, select: { id: true } });
    const ids = cos.map((c) => c.id);
    const leads = await db.lead.findMany({ where: { companyId: { in: ids } }, select: { id: true } });
    await db.task.deleteMany({ where: { leadId: { in: leads.map((l) => l.id) } } });
    await db.leadStatusHistory.deleteMany({ where: { leadId: { in: leads.map((l) => l.id) } } });
    await db.interaction.deleteMany({ where: { companyId: { in: ids } } });
    await db.lead.deleteMany({ where: { companyId: { in: ids } } });
    const contacts = await db.contact.findMany({ where: { companyId: { in: ids } }, select: { personId: true } });
    await db.contact.deleteMany({ where: { companyId: { in: ids } } });
    await db.person.deleteMany({ where: { id: { in: contacts.map((c) => c.personId) } } });
    await db.company.deleteMany({ where: { id: { in: ids } } });
    await db.user.deleteMany({ where: { id: { in: [aron, peter] } } });
    await db.tenant.update({ where: { id: 1 }, data: { settings: prevSettings as never } });
    await db.$disconnect();
  });

  it("runs a phone campaign end to end: load, approve, list, promote, analytics, undo", async () => {
    const session = { tenantId: 1, userId: peter };
    const app = { tenantId: 1, userId: null, appSlug: "it" };
    const c = await svc.createCampaign(app, { name: `${tag} Budapest`, kind: "cold_call", steps: [{ channel: "call" }], daily_cap: 15 });
    if ("error" in c) throw new Error(c.error);
    campaignId = c.id;
    slug = c.slug;

    const rows = [
      { crm_company_id: companyIds[0], company_name: "x" },
      { crm_company_id: companyIds[1], company_name: "y", phone: "+36 1 000 0002" },
      { company_name: `${tag} Gamma Kft.`, person_name: "Teszt Gamma", phone: "+36 1 000 0003" },
      { company_name: `${tag} Delta Kft.` },
    ];
    const dry = await svc.addMembers(app, slug, { dry_run: true, batch: "b1", rows });
    if ("error" in dry) throw new Error(dry.error);
    expect(dry.summary).toMatchObject({ add: 3, newCompanies: 2, needsContact: 1 });
    expect(dry.summary.skipped.open_lead).toBe(1);
    expect(await db.campaignMember.count({ where: { campaignId } })).toBe(0); // dry run wrote nothing

    // Applying is session only with an operator role: the key and a member-role user get 403.
    expect(await svc.addMembers(app, slug, { dry_run: false, batch: "b1", rows })).toMatchObject({ status: 403 });
    expect(await svc.addMembers(session, slug, { dry_run: false, batch: "b1", rows })).toMatchObject({ status: 403 });
    expect(await db.campaignMember.count({ where: { campaignId } })).toBe(0);
    const applied = await svc.addMembers({ tenantId: 1, userId: aron }, slug, { dry_run: false, batch: "b1", rows });
    if ("error" in applied) throw new Error(applied.error);
    expect(applied).toMatchObject({ added: 3 });
    const again = await svc.addMembers(app, slug, { dry_run: true, batch: "b1", rows });
    if ("error" in again) throw new Error(again.error);
    expect(again.summary.add).toBe(0); // re-run is a no-op

    expect(await svc.approveCampaign(app, slug)).toMatchObject({ status: 403 });
    expect(await svc.approveCampaign(session, slug)).toMatchObject({ status: 403 });
    expect(await svc.approveCampaign({ tenantId: 1, userId: aron }, slug)).toMatchObject({ ok: true, status: "running" });

    const list = await svc.dailyList(1, slug);
    if ("error" in list) throw new Error(list.error);
    expect(list.items).toHaveLength(2); // needs_contact is not on the list
    const [first, second] = list.items;

    const tasksBefore = await db.task.count({ where: { tenantId: 1 } });
    const promoted = await svc.recordOutcome(session, slug, { member_id: first.id, outcome: "interested" });
    if ("error" in promoted) throw new Error(promoted.error);
    expect(promoted.lead).toMatchObject({ created: true, stage: "contacting" });
    const lead = await db.lead.findUniqueOrThrow({ where: { id: promoted.lead!.id } });
    expect(lead).toMatchObject({ status: "contacting", campaign: slug, assignedToId: peter, outcome: "open" });
    expect(lead.nextDue).not.toBeNull();
    const noAnswer = await svc.recordOutcome(session, slug, { member_id: second.id, outcome: "no_answer" });
    expect(noAnswer).toMatchObject({ ok: true, lead: null, member: { state: "queued", attempts: 1 } });
    // No SLA task: at most what an active lead_created automation rule adds for the ONE promoted lead.
    const newTasks = await db.task.findMany({ where: { tenantId: 1, leadId: lead.id }, select: { title: true, setMembership: true } });
    expect(newTasks.filter((t) => t.setMembership.includes("w2_lifecycle"))).toHaveLength(0);
    expect(await db.task.count({ where: { tenantId: 1 } })).toBeLessThanOrEqual(tasksBefore + newTasks.length);

    const after = await svc.dailyList(1, slug);
    if ("error" in after) throw new Error(after.error);
    expect(after).toMatchObject({ touchedToday: 2 });
    expect(after.items).toHaveLength(0);

    const [stats] = await analytics.campaignAnalytics(1, { slug });
    expect(stats.stats).toMatchObject({ audience: 3, touched: 2, promoted: 1, needsContact: 1 });

    const undo = await svc.undoBatch(app, slug, "b1", true);
    if ("error" in undo) throw new Error(undo.error);
    // only the untouched needs_contact member goes, with the company the load created for it
    expect(undo.summary).toMatchObject({ members: 3, remove: 1, keptTouched: 2, softDeleteCompanies: 1 });
    expect(await svc.undoBatch(app, slug, "b1", false)).toMatchObject({ status: 403 });
    expect(await db.lead.findUnique({ where: { id: openLeadId } })).not.toBeNull();
  });

  it("a sequence puts the e-mail first for everyone; no e-mail is needs_email, never on the call list", async () => {
    const app = { tenantId: 1, userId: null, appSlug: "it" };
    expect(await svc.createCampaign(app, { name: `${tag} rossz`, kind: "sequence", steps: [{ channel: "call" }, { channel: "email" }] })).toMatchObject({ status: 400 });
    const c = await svc.createCampaign(app, { name: `${tag} Sorozat`, kind: "sequence", steps: [{ channel: "email" }, { channel: "call", wait_days: 3 }] });
    if ("error" in c) throw new Error(c.error);
    try {
      // A warm past client: phone on file, no e-mail.
      const warm = await db.company.create({ data: { tenantId: 1, name: `${tag} Zéta Kft.` } });
      const wp = await db.person.create({ data: { tenantId: 1, firstName: "Teszt", lastName: "Zéta", phone: "+36 1 000 0006" } });
      await db.contact.create({ data: { tenantId: 1, personId: wp.id, companyId: warm.id, phone: "+36 1 000 0006" } });
      const rows = [
        { crm_company_id: warm.id, company_name: "x" },
        { company_name: `${tag} Epszilon Kft.`, email: "info@epszilon.example.test", phone: "+36 1 000 0005" },
      ];
      const dry = await svc.addMembers(app, c.slug, { dry_run: true, batch: "s1", rows });
      if ("error" in dry) throw new Error(dry.error);
      expect(dry.summary).toMatchObject({ add: 2, needsEmail: 1 });
      expect((dry.rows ?? []).map((r) => ("state" in r ? [r.stepPosition, r.state] : null))).toEqual([[1, "needs_email"], [1, "queued"]]);
    } finally {
      await db.campaign.deleteMany({ where: { id: c.id } });
    }
  });
});
