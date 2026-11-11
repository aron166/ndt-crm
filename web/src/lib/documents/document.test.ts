import { describe, it, expect } from "vitest";
import type { OfferPdfDoc } from "@/lib/offers/offer";
import { nextDocumentNumber, buildOrderData, signOffIssue, SIGNATURE_MAX_BYTES, SIGNOFF_TEXT_MAX } from "./document";

describe("nextDocumentNumber", () => {
  it("starts at 0001", () => {
    expect(nextDocumentNumber("order", [], 2026)).toBe("MR-2026-0001");
  });
  it("uses max + 1 over same-year numbers", () => {
    expect(nextDocumentNumber("order", ["MR-2026-0001", "MR-2026-0007", "MR-2026-0003"], 2026)).toBe("MR-2026-0008");
  });
  it("ignores other years and the other kind's prefix", () => {
    expect(nextDocumentNumber("order", ["MR-2025-0099", "TI-2026-0050"], 2026)).toBe("MR-2026-0001");
    expect(nextDocumentNumber("completion", ["MR-2026-0050", "TI-2026-0002"], 2026)).toBe("TI-2026-0003");
  });
});

const offer = {
  quoteNumber: "AJ-2026-0012",
  title: "Teszt munka",
  createdAt: new Date("2026-11-01T00:00:00Z"),
  validUntil: null,
  currency: "HUF",
  vatRate: 27,
  totals: { net: 1000, vat: 270, gross: 1270, complete: true },
  customer: { company: "ZMT", contactName: "Kiss Anna", email: "a@b.hu", phone: "123" },
  lines: [{ description: "Munka", quantity: 1, unit: "db", unitRate: 1000, amount: 1000 }],
  meta: { issuer: { name: "Kiado Kft" } },
} as unknown as OfferPdfDoc;

describe("buildOrderData", () => {
  const data = buildOrderData(offer, new Date("2026-11-05T10:00:00Z"));
  it("copies issuer, customer, lines, totals", () => {
    expect(data.kind).toBe("order");
    expect(data.issuer).toBe(offer.meta.issuer);
    expect(data.customer).toEqual(offer.customer);
    expect(data.lines).toEqual(offer.lines);
    expect(data.totals).toEqual(offer.totals);
    expect(data.acceptedAt).toBe("2026-11-05T10:00:00.000Z");
  });
  it("states validity and names the quote in the terms", () => {
    expect(data.validity).toContain("a munka elvégzéséig érvényes");
    expect(data.terms.join(" ")).toContain("AJ-2026-0012");
  });
});

describe("signOffIssue", () => {
  const ok = { signerName: "Kiss Anna", signature: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=", doneScope: "Kábelezés kész" };
  it("returns null for valid input", () => {
    expect(signOffIssue(ok)).toBeNull();
    expect(signOffIssue({ ...ok, scopeChange: { text: "Extra fal", newNetHuf: 5000 } })).toBeNull();
  });
  it("rejects a missing name", () => {
    expect(signOffIssue({ ...ok, signerName: " a " })).toBe("Add meg az aláíró nevét");
  });
  it("rejects a non-PNG signature", () => {
    expect(signOffIssue({ ...ok, signature: "data:image/jpeg;base64,AAAA" })).toBe("Hiányzik az aláírás");
    expect(signOffIssue({ ...ok, signature: "" })).toBe("Hiányzik az aláírás");
  });
  it("rejects an oversized signature", () => {
    const big = "data:image/png;base64," + "A".repeat(SIGNATURE_MAX_BYTES);
    expect(signOffIssue({ ...ok, signature: big })).toBe("Az aláírás túl nagy, töröld és írd alá újra");
  });
  it("rejects a too-short or too-long scope", () => {
    expect(signOffIssue({ ...ok, doneScope: "ab" })).toBe("Írd le röviden az elvégzett munkát");
    expect(signOffIssue({ ...ok, doneScope: "x".repeat(SIGNOFF_TEXT_MAX + 1) })).toBe("Az elvégzett munka leírása túl hosszú");
  });
  it("rejects a scope change without text or with a negative price", () => {
    expect(signOffIssue({ ...ok, scopeChange: { text: " ", newNetHuf: 100 } })).toBe("Írd le a módosítást");
    expect(signOffIssue({ ...ok, scopeChange: { text: "Extra", newNetHuf: -1 } })).toBe("Add meg az új nettó árat");
  });
});

describe("isRealPng (Vanda #B3)", () => {
  it("accepts a real PNG and rejects base64 that only looks like one", async () => {
    const { isRealPng } = await import("./document");
    expect(isRealPng("data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=")).toBe(true);
    expect(isRealPng("data:image/png;base64,AAAA")).toBe(false);
    expect(isRealPng("data:image/png;base64," + "A".repeat(200))).toBe(false);
  });
});
