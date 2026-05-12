import { describe, it, expect } from "vitest";

// Test the result flattening logic (pure, no DB)
type ResultKind = "company" | "person" | "deal" | "task" | "tag";

interface SearchResults {
  companies: { id: number; name: string; city: string | null; pipelineStatus: string | null }[];
  persons:   { id: number; firstName: string | null; lastName: string | null; email: string | null; company: string | null }[];
  deals:     { id: number; title: string; stageName: string | null; value: number | null; companyName: string }[];
  tasks:     { id: number; title: string; status: string; companyName: string | null }[];
  tags:      { id: number; name: string; color: string; count: number }[];
}

function totalResults(r: SearchResults): number {
  return r.companies.length + r.persons.length + r.deals.length + r.tasks.length + r.tags.length;
}

function hasResultsFor(r: SearchResults, kind: ResultKind): boolean {
  return r[kind === "company" ? "companies" : `${kind}s` as keyof SearchResults].length > 0;
}

describe("search result counting", () => {
  it("counts total results across all groups", () => {
    const r: SearchResults = {
      companies: [{ id: 1, name: "MÁV", city: "Budapest", pipelineStatus: "3" }],
      persons:   [{ id: 2, firstName: "Béla", lastName: "Kovács", email: null, company: "MÁV" }],
      deals:     [],
      tasks:     [{ id: 3, title: "MÁV audit", status: "created", companyName: "MÁV" }],
      tags:      [],
    };
    expect(totalResults(r)).toBe(3);
  });

  it("returns 0 for empty results", () => {
    const empty: SearchResults = { companies: [], persons: [], deals: [], tasks: [], tags: [] };
    expect(totalResults(empty)).toBe(0);
  });
});

describe("keyboard navigation index", () => {
  it("clamps active index to result count - 1", () => {
    const maxIdx = 4;
    const clamp = (i: number) => Math.min(Math.max(i, 0), maxIdx);
    expect(clamp(-1)).toBe(0);
    expect(clamp(5)).toBe(4);
    expect(clamp(2)).toBe(2);
  });
});
