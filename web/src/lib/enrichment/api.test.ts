import { describe, it, expect } from "vitest";
import { NextResponse } from "next/server";
import { parseEnrichmentBody } from "./api";

// The body parser is the whole trust boundary of PATCH /api/companies|persons/:id:
// the dossier is written by an external research agent, and closeness_score must
// stay CRM-owned.
describe("parseEnrichmentBody", () => {
  it("accepts a valid dossier", () => {
    const body = {
      enrichment: {
        summary: "Hídépítő, 2024-ben két nagy projekt",
        apropo: ["M1 felújítás", "új telephely Győrben", "ISO 9001 audit"],
        items: [{ date: "2024-03", title: "Telephelybővítés", url: "https://example.hu/hir" }],
      },
    };
    const out = parseEnrichmentBody(body);
    expect(out).not.toBeInstanceOf(NextResponse);
    expect((out as { enrichment: { apropo: string[] } }).enrichment.apropo).toHaveLength(3);
  });

  it("accepts an explicit null (clears the dossier)", () => {
    const out = parseEnrichmentBody({ enrichment: null });
    expect(out).not.toBeInstanceOf(NextResponse);
    expect((out as { enrichment: null }).enrichment).toBeNull();
  });

  it("rejects closeness_score with its own message, whatever the value", async () => {
    for (const value of [0, 99, null, "80"]) {
      const out = parseEnrichmentBody({ enrichment: null, closeness_score: value });
      expect(out).toBeInstanceOf(NextResponse);
      const res = out as NextResponse;
      expect(res.status).toBe(400);
      expect((await res.json()).error).toMatch(/closeness_score is computed by the CRM/);
    }
  });

  it("rejects a missing enrichment key", () => {
    expect(parseEnrichmentBody({})).toBeInstanceOf(NextResponse);
  });

  it("rejects an unknown top-level key instead of silently ignoring it", () => {
    expect(parseEnrichmentBody({ enrichment: null, closenessScore: 99 })).toBeInstanceOf(NextResponse);
  });

  it("rejects a fourth apropó line and unknown top-level keys", () => {
    expect(parseEnrichmentBody({ enrichment: { apropo: ["a", "b", "c", "d"] } })).toBeInstanceOf(NextResponse);
    expect(parseEnrichmentBody({ enrichment: { nem_letezo: 1 } })).toBeInstanceOf(NextResponse);
  });

  it("rejects an item with no title and a non-URL url", () => {
    expect(parseEnrichmentBody({ enrichment: { items: [{ date: "2024" }] } })).toBeInstanceOf(NextResponse);
    expect(
      parseEnrichmentBody({ enrichment: { items: [{ title: "x", url: "javascript:alert(1)" }] } }),
    ).toBeInstanceOf(NextResponse);
  });
});
