// @vitest-environment node
import { describe, it, expect, beforeAll, afterAll, vi } from "vitest";
import { readFileSync } from "node:fs";
import path from "node:path";

// audit() defers through next/server after(), which needs a request scope.
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
// The intake must never send mail.
vi.mock("@/lib/integrations/resend", () => ({
  sendEmail: vi.fn(() => { throw new Error("sendEmail must not be called"); }),
  getResendConfig: vi.fn().mockResolvedValue(null),
}));

/**
 * Reply intake against a real local Postgres (never production). Skipped unless
 * CAMPAIGNS_IT_DATABASE_URL is set and obviously local. Rows are tagged and removed;
 * the tenant settings keep every other key.
 */
const CONNECTION = process.env.CAMPAIGNS_IT_DATABASE_URL;
const enabled = Boolean(CONNECTION && (CONNECTION.includes("127.0.0.1") || CONNECTION.includes("localhost")));
const fx = (n: string) => readFileSync(path.join(__dirname, "fixtures", n));

describe.skipIf(!enabled)("reply intake (integration)", () => {
  let db: typeof import("@/lib/db")["db"];
  let run: typeof import("./run");
  const tag = `it-reply-${Date.now()}`;
  let companyIds: number[] = [];
  let prevSettings: unknown = null;
  let drafts: { reply: number; touch2: number; bounce: number };
  const mailFrom = (addr: string, id: string, date: string) =>
    Buffer.from(`From: ${addr}\r\nTo: aron@ndt.hu\r\nSubject: Re: Ajanlat\r\nDate: ${date}\r\nMessage-ID: <${id}>\r\n\r\nErdekel\r\n`);

  beforeAll(async () => {
    process.env.DATABASE_URL = CONNECTION;
    ({ db } = await import("@/lib/db"));
    run = await import("./run");
    const { threadKeyFor } = await import("@/lib/outreach/drafts");
    const t = await db.tenant.findUniqueOrThrow({ where: { id: 1 }, select: { settings: true } });
    prevSettings = t.settings;
    const campaign = `${tag}-camp`;
    const a = await db.company.create({ data: { tenantId: 1, name: `${tag} Pelda Kft.` } });
    const b = await db.company.create({ data: { tenantId: 1, name: `${tag} Halott Kft.` } });
    companyIds = [a.id, b.id];
    const base = { tenantId: 1, campaign, subject: "s", body: "b", sentAt: new Date("2026-11-10T09:00:00Z") };
    const reply = await db.emailDraft.create({ data: { ...base, companyId: a.id, step: 1, status: "sent", toEmail: "anna@pelda-kft.hu", threadKey: threadKeyFor(campaign, a.id) } });
    const touch2 = await db.emailDraft.create({ data: { ...base, companyId: a.id, step: 2, status: "approved", toEmail: "anna@pelda-kft.hu", sentAt: null } });
    const bounce = await db.emailDraft.create({ data: { ...base, companyId: b.id, step: 1, status: "sent", toEmail: "dead@pelda-kft.hu", threadKey: threadKeyFor(campaign, b.id) } });
    // sent 2026-11-13 (after the mail date) and 2026-09-01 (72 days before it): neither may match by address
    await db.emailDraft.create({ data: { ...base, companyId: a.id, step: 3, status: "sent", toEmail: "late@pelda-kft.hu", sentAt: new Date("2026-11-13T09:00:00Z"), threadKey: threadKeyFor(campaign, a.id) + "-late" } });
    await db.emailDraft.create({ data: { ...base, companyId: a.id, step: 4, status: "sent", toEmail: "old@pelda-kft.hu", sentAt: new Date("2026-09-01T09:00:00Z"), threadKey: threadKeyFor(campaign, a.id) + "-old" } });
    drafts = { reply: reply.id, touch2: touch2.id, bounce: bounce.id };
  });

  afterAll(async () => {
    if (!db) return;
    const leads = await db.lead.findMany({ where: { companyId: { in: companyIds } }, select: { id: true } });
    const leadIds = leads.map((l) => l.id);
    await db.emailProviderEvent.deleteMany({ where: { tenantId: 1, provider: "imap", eventId: { in: ["<plain-1@mail.pelda-kft.hu>", "<bounce-1@mail.pelda-kft.hu>", "<ooo-1@mail.pelda-kft.hu>", "<it-late@x>", "<it-old@x>", "<it-bounce-stranger@x>"] } } });
    await db.task.deleteMany({ where: { leadId: { in: leadIds } } });
    await db.leadStatusHistory.deleteMany({ where: { leadId: { in: leadIds } } });
    await db.interaction.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.lead.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.emailDraft.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.suppression.deleteMany({ where: { tenantId: 1, email: "dead@pelda-kft.hu" } });
    const contacts = await db.contact.findMany({ where: { companyId: { in: companyIds } }, select: { personId: true } });
    await db.contact.deleteMany({ where: { companyId: { in: companyIds } } });
    await db.person.deleteMany({ where: { id: { in: contacts.map((c) => c.personId) } } });
    await db.company.deleteMany({ where: { id: { in: companyIds } } });
    await db.tenant.update({ where: { id: 1 }, data: { settings: prevSettings as never } });
    await db.$disconnect();
  });

  it("a reply flips the draft, cancels touch 2, makes exactly one lead; a second run changes nothing", async () => {
    const first = await run.runReplyIntake(1, [fx("plain-reply.eml")]);
    expect(first).toMatchObject({ new: 1, replies: 1 });
    const second = await run.runReplyIntake(1, [fx("plain-reply.eml")]);
    expect(second).toMatchObject({ seen: 1, new: 0, replies: 0 });

    expect((await db.emailDraft.findUniqueOrThrow({ where: { id: drafts.reply } })).status).toBe("replied");
    expect((await db.emailDraft.findUniqueOrThrow({ where: { id: drafts.touch2 } })).status).toBe("cancelled");
    const leads = await db.lead.findMany({ where: { companyId: companyIds[0] } });
    expect(leads).toHaveLength(1);
    expect(leads[0].source).toBe("cold_email_reply");
    const ev = await db.emailProviderEvent.findUniqueOrThrow({ where: { provider_eventId: { provider: "imap", eventId: "<plain-1@mail.pelda-kft.hu>" } } });
    expect(ev.processedAt).not.toBeNull();
    expect(ev.draftId).toBe(drafts.reply);
  });

  it("a bounce suppresses the address once", async () => {
    await run.runReplyIntake(1, [fx("bounce-dsn.eml")]);
    await run.runReplyIntake(1, [fx("bounce-dsn.eml")]);
    expect(await db.suppression.count({ where: { tenantId: 1, email: "dead@pelda-kft.hu" } })).toBe(1);
  });

  it("an out-of-office creates no lead and changes no draft", async () => {
    const before = await db.lead.count({ where: { companyId: { in: companyIds } } });
    const r = await run.runReplyIntake(1, [fx("out-of-office.eml")]);
    expect(r.autos).toBe(1);
    expect(await db.lead.count({ where: { companyId: { in: companyIds } } })).toBe(before);
  });

  it("a mail dated before the draft was sent, or 60+ days after, matches nothing (Vanda #203-4)", async () => {
    const before = await db.lead.count({ where: { companyId: { in: companyIds } } });
    const r = await run.runReplyIntake(1, [
      mailFrom("late@pelda-kft.hu", "it-late@x", "Thu, 12 Nov 2026 09:30:00 +0100"),
      mailFrom("old@pelda-kft.hu", "it-old@x", "Thu, 12 Nov 2026 09:30:00 +0100"),
    ]);
    expect(r).toMatchObject({ unmatched: 2, replies: 0 });
    expect(await db.lead.count({ where: { companyId: { in: companyIds } } })).toBe(before);
  });

  it("markInboxChecked writes inboxCheckedAt and keeps the other settings keys", async () => {
    await db.tenant.update({ where: { id: 1 }, data: { settings: { ...(prevSettings as object | null), itKeep: tag } } });
    const now = new Date("2026-11-12T10:00:00Z");
    await run.markInboxChecked(1, now);
    const s = (await db.tenant.findUniqueOrThrow({ where: { id: 1 }, select: { settings: true } })).settings as Record<string, unknown>;
    expect(s.inboxCheckedAt).toBe(now.toISOString());
    expect(s.itKeep).toBe(tag);
  });
});
