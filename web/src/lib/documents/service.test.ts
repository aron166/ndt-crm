import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { changeLeadStatus, type LeadCtx } from "@/lib/leads/service";
import { loadOfferPdfDoc } from "@/lib/offers/service";
import { createOrderDocument, signOffLead } from "./service";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/leads/service", () => ({ changeLeadStatus: vi.fn(), LIFECYCLE_TASK_TAG: "lifecycle" }));
vi.mock("@/lib/offers/service", () => ({ loadOfferPdfDoc: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    lead: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
    quote: { findFirst: vi.fn() },
    task: { create: vi.fn(), findFirst: vi.fn() },
    leadStatusHistory: { findFirst: vi.fn() },
    leadDocument: { findFirst: vi.fn(), findMany: vi.fn(), create: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
    $transaction: vi.fn(),
  },
}));

const d = vi.mocked(db, true);
const change = vi.mocked(changeLeadStatus);
const ctx = { tenantId: 1, userId: 9, actor: "user" } as unknown as LeadCtx;

const offer = {
  quoteNumber: "AJ-2026-0012", title: "T", vatRate: 27,
  totals: { net: 1, vat: 0, gross: 1, complete: true },
  customer: { company: null, contactName: null, email: null, phone: null },
  lines: [], meta: { issuer: { name: "K" } },
};
const input = { signerName: "Kiss Anna", signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", doneScope: "Kész a munka" };
const orderedLead = { status: "ordered", companyId: 3, customFields: {}, company: { name: "ZMT" }, contact: { email: null, phone: null, personId: 5, person: null } };

beforeEach(() => {
  vi.clearAllMocks();
  d.$transaction.mockImplementation((async (fn: (tx: unknown) => unknown) => fn(d)) as never);
  d.leadDocument.findFirst.mockResolvedValue(null as never);
  d.leadDocument.findMany.mockResolvedValue([] as never);
  d.leadDocument.create.mockResolvedValue({ id: 100, number: "X-1" } as never);
  d.tenant.findUnique.mockResolvedValue({ settings: {} } as never);
  change.mockResolvedValue({ success: true } as never);
});

describe("createOrderDocument", () => {
  it("returns the existing document without creating", async () => {
    d.leadDocument.findFirst.mockResolvedValue({ id: 5, number: "MR-2026-0001" } as never);
    expect(await createOrderDocument(42, ctx)).toEqual({ success: true, documentId: 5, number: "MR-2026-0001" });
    expect(d.leadDocument.create).not.toHaveBeenCalled();
  });
  it("refuses a quote that is not accepted", async () => {
    d.quote.findFirst.mockResolvedValue(null as never);
    expect(await createOrderDocument(42, ctx)).toEqual({ error: "Csak elfogadott ajánlatból készül megrendelő" });
    expect(d.leadDocument.create).not.toHaveBeenCalled();
  });
  it("creates one order document with quoteId", async () => {
    d.quote.findFirst.mockResolvedValue({ leadId: 7, acceptedAt: new Date() } as never);
    vi.mocked(loadOfferPdfDoc).mockResolvedValue(offer as never);
    const r = await createOrderDocument(42, ctx);
    expect(r).toMatchObject({ success: true, documentId: 100 });
    expect(d.leadDocument.create).toHaveBeenCalledTimes(1);
    expect(d.leadDocument.create.mock.calls[0][0].data).toMatchObject({ quoteId: 42, kind: "order", leadId: 7, tenantId: 1 });
  });
  it("retries the number on P2002 then succeeds", async () => {
    d.quote.findFirst.mockResolvedValue({ leadId: 7, acceptedAt: new Date() } as never);
    vi.mocked(loadOfferPdfDoc).mockResolvedValue(offer as never);
    d.leadDocument.create
      .mockRejectedValueOnce(Object.assign(new Error("dup"), { code: "P2002" }))
      .mockResolvedValueOnce({ id: 101, number: "MR-2026-0002" } as never);
    expect(await createOrderDocument(42, ctx)).toMatchObject({ success: true, documentId: 101 });
    expect(d.leadDocument.create).toHaveBeenCalledTimes(2);
  });
});

describe("signOffLead", () => {
  it("refuses a lead that is not ordered", async () => {
    d.lead.findFirst.mockResolvedValue({ ...orderedLead, status: "qualified" } as never);
    expect(await signOffLead(7, input, ctx)).toHaveProperty("error");
    expect(d.leadDocument.create).not.toHaveBeenCalled();
  });
  it("refuses invalid input before any DB write", async () => {
    expect(await signOffLead(7, { ...input, signerName: "" }, ctx)).toEqual({ error: "Add meg az aláíró nevét" });
    expect(d.lead.findFirst).not.toHaveBeenCalled();
    expect(d.leadDocument.create).not.toHaveBeenCalled();
  });
  it("creates one completion document, logs work_completed, creates the invoice task", async () => {
    d.lead.findFirst.mockResolvedValue(orderedLead as never);
    d.leadDocument.findFirst
      .mockResolvedValueOnce({ number: "MR-2026-0003", data: {}, createdAt: new Date("2026-11-01") } as never)
      .mockResolvedValueOnce(null as never);
    d.leadDocument.create.mockResolvedValue({ id: 200, number: "TI-2026-0001" } as never);
    const r = await signOffLead(7, input, ctx);
    expect(r).toEqual({ success: true, documentId: 200, number: "TI-2026-0001" });
    expect(d.leadDocument.create).toHaveBeenCalledTimes(1);
    const data = d.leadDocument.create.mock.calls[0][0].data as unknown as { kind: string; data: Record<string, unknown> };
    expect(data.kind).toBe("completion");
    expect(data.data).toMatchObject({ signerName: "Kiss Anna", signature: input.signature, orderNumber: "MR-2026-0003" });
    expect(typeof data.data.signedAt).toBe("string");
    expect(Number.isNaN(Date.parse(data.data.signedAt as string))).toBe(false);
    expect(change).toHaveBeenCalledWith(7, "ordered", ctx, expect.objectContaining({ event: "work_completed" }));
    expect(d.task.create).toHaveBeenCalledTimes(1);
  });
  it("keeps the document when the status move fails and names its number", async () => {
    d.lead.findFirst.mockResolvedValue(orderedLead as never);
    d.leadDocument.findFirst.mockResolvedValue(null as never);
    d.leadDocument.create.mockResolvedValue({ id: 200, number: "TI-2026-0001" } as never);
    change.mockResolvedValue({ error: "nem lehet" } as never);
    const r = await signOffLead(7, input, ctx);
    expect(r).toHaveProperty("error");
    expect((r as { error: string }).error).toContain("TI-2026-0001");
    expect(d.leadDocument.delete).not.toHaveBeenCalled();
    expect(d.leadDocument.deleteMany).not.toHaveBeenCalled();
    expect(d.task.create).not.toHaveBeenCalled();
  });
  it("a retry finds the signed document: no second document, the missing move and task are completed once (Vanda #B1)", async () => {
    d.lead.findFirst.mockResolvedValue(orderedLead as never);
    d.leadDocument.findFirst
      .mockResolvedValueOnce({ number: "MR-2026-0003", data: {}, createdAt: new Date("2026-11-01") } as never)
      .mockResolvedValueOnce({ id: 200, number: "TI-2026-0001", data: { scopeChange: null }, createdAt: new Date("2026-11-02") } as never);
    d.leadStatusHistory.findFirst.mockResolvedValue(null as never);
    d.task.findFirst.mockResolvedValue(null as never);
    change.mockResolvedValue({ success: true, changed: true } as never);
    expect(await signOffLead(7, input, ctx)).toEqual({ success: true, documentId: 200, number: "TI-2026-0001" });
    expect(d.leadDocument.create).not.toHaveBeenCalled();
    expect(change).toHaveBeenCalledTimes(1);
    expect(d.task.create).toHaveBeenCalledTimes(1);
  });
  it("a second retry after a full sign-off changes nothing", async () => {
    d.lead.findFirst.mockResolvedValue(orderedLead as never);
    d.leadDocument.findFirst
      .mockResolvedValueOnce({ number: "MR-2026-0003", data: {}, createdAt: new Date("2026-11-01") } as never)
      .mockResolvedValueOnce({ id: 200, number: "TI-2026-0001", data: { scopeChange: null }, createdAt: new Date("2026-11-02") } as never);
    d.leadStatusHistory.findFirst.mockResolvedValue({ id: 5 } as never);
    d.task.findFirst.mockResolvedValue({ id: 9 } as never);
    expect(await signOffLead(7, input, ctx)).toEqual({ success: true, documentId: 200, number: "TI-2026-0001" });
    expect(d.leadDocument.create).not.toHaveBeenCalled();
    expect(change).not.toHaveBeenCalled();
    expect(d.task.create).not.toHaveBeenCalled();
  });
});
