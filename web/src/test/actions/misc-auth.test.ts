import { describe, it, expect, vi, beforeEach } from "vitest";

// Every export of outreach / tags / company-attributes / enrichment / search /
// audit refuses a non-CRM caller BEFORE any DB access or external call.

const { db } = vi.hoisted(() => {
  const m = () => ({
    findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(),
    update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn(),
  });
  return {
    db: {
      company: m(), person: m(), deal: m(), task: m(), interaction: m(), contact: m(), tag: m(),
      tagging: m(), savedView: m(), companyAttribute: m(), enrichmentRun: m(),
      enrichmentProposal: m(), auditLog: m(), $transaction: vi.fn(),
    },
  };
});

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("groq-sdk", () => ({ default: vi.fn() }));
vi.mock("@/lib/marketing/audience-query", () => ({ audienceWhere: vi.fn() }));
vi.mock("@/lib/enrichment/recompute", () => ({ recomputeCloseness: vi.fn() }));
vi.mock("@/lib/actor", () => {
  const getActor = vi.fn();
  return { getActor, NOT_A_CRM_USER: "NOT_A_CRM_USER", requireCrmUser: async (t: number) => ((await getActor(t)).userId == null ? "NOT_A_CRM_USER" : null),
};
});

import { getActor } from "@/lib/actor";
import * as outreach from "@/app/actions/outreach";
import * as tags from "@/app/actions/tags";
import * as attrs from "@/app/actions/company-attributes";
import * as enrichment from "@/app/actions/enrichment";
import * as search from "@/app/actions/search";
import * as auditActions from "@/app/actions/audit";

const mockGetActor = getActor as unknown as ReturnType<typeof vi.fn>;
const fetchSpy = vi.fn();
vi.stubGlobal("fetch", fetchSpy);

beforeEach(() => {
  vi.clearAllMocks();
  mockGetActor.mockResolvedValue({ userId: null, email: null });
});

function noDbCalls() {
  for (const [k, v] of Object.entries(db)) {
    if (k === "$transaction") expect(v).not.toHaveBeenCalled();
    else for (const fn of Object.values(v)) expect(fn).not.toHaveBeenCalled();
  }
  expect(fetchSpy).not.toHaveBeenCalled();
}

const DENIED = "NOT_A_CRM_USER";

describe("misc actions auth gate", () => {
  it("outreach", async () => {
    await expect(outreach.getCallSegments()).rejects.toThrow(DENIED);
    await expect(outreach.getCallQueue(1)).rejects.toThrow(DENIED);
    expect(await outreach.startCall({ companyId: 1 })).toEqual({ error: DENIED });
    expect(await outreach.recordCall({ companyId: 1, outcome: "x" })).toEqual({ error: DENIED });
    noDbCalls();
  });

  it("tags", async () => {
    expect(await tags.addTag("company", 1, "x")).toEqual({ error: DENIED });
    expect(await tags.removeTag("company", 1, 1)).toEqual({ error: DENIED });
    await expect(tags.getTagsForEntity("company", 1)).rejects.toThrow(DENIED);
    await expect(tags.searchByTag("x")).rejects.toThrow(DENIED);
    noDbCalls();
  });

  it("company-attributes", async () => {
    await expect(attrs.getCompanyAttributes(1)).rejects.toThrow(DENIED);
    expect(await attrs.setPrimaryCompanyAttribute(1, "x", "v")).toEqual({ error: DENIED });
    expect(await attrs.addSecondaryCompanyAttribute(1, "x", "v")).toEqual({ error: DENIED });
    expect(await attrs.endCompanyAttribute(1)).toEqual({ error: DENIED });
    noDbCalls();
  });

  it("enrichment", async () => {
    await expect(enrichment.triggerBulkEnrichment("company", [1])).rejects.toThrow(DENIED);
    await expect(enrichment.applyProposal(1, ["name"])).rejects.toThrow(DENIED);
    await expect(enrichment.getProposalsByRun(1)).rejects.toThrow(DENIED);
    await expect(enrichment.getEnrichmentRuns()).rejects.toThrow(DENIED);
    await expect(enrichment.getPendingProposals()).rejects.toThrow(DENIED);
    noDbCalls();
  });

  it("search and audit", async () => {
    await expect(search.globalSearch("x")).rejects.toThrow(DENIED);
    await expect(auditActions.getEntityHistory("company", 1)).rejects.toThrow(DENIED);
    noDbCalls();
  });

  it("tags refuse an entity outside the tenant", async () => {
    mockGetActor.mockResolvedValue({ userId: 2, email: "a@b.c" });
    db.company.findFirst.mockResolvedValue(null);
    expect(await tags.addTag("company", 99, "x")).toEqual({ error: "Nem található" });
    expect(db.tag.upsert).not.toHaveBeenCalled();
  });
});
