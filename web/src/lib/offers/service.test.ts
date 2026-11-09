import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { changeLeadStatus, type LeadCtx } from "@/lib/leads/service";
import { sendEmail } from "@/lib/integrations/resend";
import { createLeadOffer, sendLeadOffer, acceptLeadOffer } from "./service";
import { DEFAULT_OFFER_CONFIG } from "./offer";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/leads/service", () => ({ changeLeadStatus: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("./pdf", () => ({ renderOfferPdf: vi.fn().mockResolvedValue(new Uint8Array([1, 2, 3])) }));
vi.mock("@/lib/db", () => ({
  db: {
    lead: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    quote: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), deleteMany: vi.fn(), updateMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const d = vi.mocked(db, true);
const change = vi.mocked(changeLeadStatus);
const send = vi.mocked(sendEmail);
const ctx = { tenantId: 1, actor: "user" } as unknown as LeadCtx;

const lead = (over: Record<string, unknown> = {}) => ({
  id: 7, status: "contacting", outcome: "open", companyId: 3, offerType: null,
  contact: { personId: 5 }, company: { name: "ZMT" }, ...over,
});

beforeEach(() => {
  vi.clearAllMocks();
  d.tenant.findUnique.mockResolvedValue({ settings: {} } as never);
  d.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(d)) as never);
  d.quote.findMany.mockResolvedValue([] as never);
  d.quote.create.mockResolvedValue({ id: 42 } as never);
  change.mockResolvedValue({ success: true } as never);
});

describe("createLeadOffer", () => {
  it("from contacting: qualified then offer_sent, one quote with template, meta, items", async () => {
    d.lead.findFirst.mockResolvedValue(lead() as never);
    const r = await createLeadOffer(7, { template: "demo" }, ctx);
    expect(r).toMatchObject({ success: true, quoteId: 42 });
    expect(change).toHaveBeenCalledTimes(2);
    expect(change).toHaveBeenNthCalledWith(1, 7, "qualified", ctx, { event: "call_qualified", offerType: "service" });
    expect(change.mock.calls[1][1]).toBe("offer_sent");
    expect(change.mock.calls[1][3]).toMatchObject({ event: "offer_sent" });
    expect(d.quote.create).toHaveBeenCalledTimes(1);
    const data = d.quote.create.mock.calls[0][0].data as Record<string, any>;
    expect(data.template).toBe("demo");
    expect(data.meta.template).toBe("demo");
    expect(data.items.create).toHaveLength(1);
    expect(send).not.toHaveBeenCalled();
  });

  it("from qualified: only offer_sent", async () => {
    d.lead.findFirst.mockResolvedValue(lead({ status: "qualified" }) as never);
    await createLeadOffer(7, { template: "demo" }, ctx);
    expect(change).toHaveBeenCalledTimes(1);
    expect(change.mock.calls[0][1]).toBe("offer_sent");
  });

  it("deletes the draft and returns the error when the qualified move fails", async () => {
    d.lead.findFirst.mockResolvedValue(lead() as never);
    change.mockResolvedValueOnce({ error: "nem lehet" } as never);
    const r = await createLeadOffer(7, { template: "demo" }, ctx);
    expect(r).toEqual({ error: "nem lehet" });
    expect(d.quote.deleteMany).toHaveBeenCalledWith({ where: { id: 42, tenantId: 1, status: "draft" } });
    expect(change).toHaveBeenCalledTimes(1);
  });

  it("refuses a closed lead and a lead without company", async () => {
    d.lead.findFirst.mockResolvedValue(lead({ outcome: "lost" }) as never);
    expect(await createLeadOffer(7, { template: "demo" }, ctx)).toHaveProperty("error");
    d.lead.findFirst.mockResolvedValue(lead({ companyId: null }) as never);
    expect(await createLeadOffer(7, { template: "demo" }, ctx)).toHaveProperty("error");
    expect(d.quote.create).not.toHaveBeenCalled();
    expect(send).not.toHaveBeenCalled();
  });
});

const docQuote = (over: Record<string, unknown> = {}) => ({
  id: 42, quoteNumber: "AJ-2026-0001", title: "T", createdAt: new Date(), validUntil: null, currency: "HUF", vatRate: 27,
  meta: {
    template: "demo", intro: [], terms: [], acceptance: "x", validityDays: 30,
    issuer: { ...DEFAULT_OFFER_CONFIG.issuer, address: "addr", taxNumber: "123" },
  },
  items: [{ description: "d", quantity: 1, unit: "alkalom", unitRate: 100000, amount: 100000 }],
  company: { name: "ZMT" }, person: null, ...over,
});
const sendRow = (email: string | null) => ({
  id: 42, status: "draft", leadId: 7, companyId: 3, personId: 5,
  lead: { customFields: {}, contact: { email, person: null } },
});

describe("sendLeadOffer", () => {
  it("refuses placeholders without sending", async () => {
    d.quote.findFirst.mockResolvedValueOnce(sendRow("a@b.hu") as never).mockResolvedValueOnce(
      docQuote({ items: [{ description: "d", quantity: 1, unit: "x", unitRate: null, amount: null }] }) as never);
    expect(await sendLeadOffer(42, ctx)).toHaveProperty("error");
    expect(send).not.toHaveBeenCalled();
  });

  it("refuses without a lead email", async () => {
    d.quote.findFirst.mockResolvedValueOnce(sendRow(null) as never);
    expect(await sendLeadOffer(42, ctx)).toHaveProperty("error");
    expect(send).not.toHaveBeenCalled();
  });

  it("sends one email with a base64 PDF and marks the quote sent", async () => {
    d.quote.findFirst.mockResolvedValueOnce(sendRow("lead@x.hu") as never).mockResolvedValueOnce(docQuote() as never);
    send.mockResolvedValue({ ok: true } as never);
    const r = await sendLeadOffer(42, ctx);
    expect(r).toEqual({ success: true, to: "lead@x.hu" });
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.to).toBe("lead@x.hu");
    expect(arg.attachments?.[0].content).toBe(Buffer.from([1, 2, 3]).toString("base64"));
    expect(d.quote.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "sent" }) }));
  });
});

describe("acceptLeadOffer", () => {
  const row = (status: string, leadStatus = "offer_sent") => ({ id: 42, status, leadId: 7, lead: { status: leadStatus } });

  it("moves to ordered with offer_accepted and marks accepted", async () => {
    d.quote.findFirst.mockResolvedValue(row("sent") as never);
    expect(await acceptLeadOffer(42, ctx)).toEqual({ success: true });
    expect(change).toHaveBeenCalledWith(7, "ordered", ctx, { event: "offer_accepted" });
    expect(d.quote.updateMany).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ status: "accepted" }) }));
  });

  it("uses order_placed after a demo", async () => {
    d.quote.findFirst.mockResolvedValue(row("sent", "demo_done") as never);
    await acceptLeadOffer(42, ctx);
    expect(change).toHaveBeenCalledWith(7, "ordered", ctx, { event: "order_placed" });
  });

  it("is idempotent for an accepted quote", async () => {
    d.quote.findFirst.mockResolvedValue(row("accepted") as never);
    expect(await acceptLeadOffer(42, ctx)).toEqual({ success: true });
    expect(change).not.toHaveBeenCalled();
    expect(d.quote.updateMany).not.toHaveBeenCalled();
  });
});
