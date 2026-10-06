import { describe, it, expect, vi, beforeEach } from "vitest";

// Every export of the companies, persons, deals, quotes and custom-fields
// actions refuses a caller that is not a CRM user BEFORE any DB access.

const { calls, db } = vi.hoisted(() => {
  const calls: string[] = [];
  const model = (name: string) =>
    new Proxy({}, { get: (_t, method: string) => (...a: unknown[]) => { calls.push(`${name}.${method}`); return Promise.resolve(null); } });
  const db = new Proxy({}, {
    get: (_t, name: string) =>
      name === "$transaction" ? (...a: unknown[]) => { calls.push("$transaction"); return Promise.resolve([]); } : model(name),
  });
  return { calls, db };
});

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/integrations/google_maps", () => ({ geocode: vi.fn() }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: vi.fn() }));
vi.mock("@/lib/actor", () => {
  const getActor = vi.fn();
  return { getActor, NOT_A_CRM_USER: "NOT_A_CRM_USER", requireCrmUser: async (t: number) => ((await getActor(t)).userId == null ? "NOT_A_CRM_USER" : null),
};
});

import { getActor } from "@/lib/actor";
import * as companies from "@/app/actions/companies";
import * as persons from "@/app/actions/persons";
import * as deals from "@/app/actions/deals";
import * as quotes from "@/app/actions/quotes";
import * as customFields from "@/app/actions/custom-fields";

const mockGetActor = getActor as unknown as ReturnType<typeof vi.fn>;
const DENIED = "NOT_A_CRM_USER";

const form = () => {
  const f = new FormData();
  f.set("title", "t"); f.set("name", "n"); f.set("label", "l"); f.set("companyId", "1"); f.set("pipelineId", "1");
  return f;
};
const quoteInput = { companyId: 1, title: "t", vatRate: 27, lines: [] };

const cases: Array<[string, () => Promise<unknown>]> = [
  ["createCompany", () => companies.createCompany({ name: "x" })],
  ["updateCompany", () => companies.updateCompany(1, { name: "x" })],
  ["deleteCompany", () => companies.deleteCompany(1)],
  ["restoreCompany", () => companies.restoreCompany(1)],
  ["geocodeCompany", () => companies.geocodeCompany(1)],
  ["createPerson", () => persons.createPerson({ firstName: "a", lastName: "b" })],
  ["updatePerson", () => persons.updatePerson(1, { firstName: "a" })],
  ["deletePerson", () => persons.deletePerson(1)],
  ["restorePerson", () => persons.restorePerson(1)],
  ["createDeal", () => deals.createDeal(form())],
  ["updateDeal", () => deals.updateDeal(1, form())],
  ["moveDeal", () => deals.moveDeal(1, 2, 0)],
  ["deleteDeal", () => deals.deleteDeal(1, { company: true, person: true })],
  ["createPipeline", () => deals.createPipeline(form())],
  ["upsertStage", () => deals.upsertStage(form())],
  ["reorderStages", () => deals.reorderStages(1, [1, 2])],
  ["deleteStage", () => deals.deleteStage(1)],
  ["getQuotes", () => quotes.getQuotes()],
  ["getQuote", () => quotes.getQuote(1)],
  ["createQuote", () => quotes.createQuote(quoteInput)],
  ["updateQuote", () => quotes.updateQuote(1, quoteInput)],
  ["setQuoteStatus", () => quotes.setQuoteStatus(1, "sent")],
  ["searchCompaniesForQuote", () => quotes.searchCompaniesForQuote("a")],
  ["deleteQuote", () => quotes.deleteQuote(1)],
  ["upsertCustomField", () => customFields.upsertCustomField(form())],
  ["deleteCustomField", () => customFields.deleteCustomField(1)],
];

beforeEach(() => {
  calls.length = 0;
  vi.clearAllMocks();
  mockGetActor.mockResolvedValue({ userId: null, email: null });
});

describe("CRUD actions auth gate", () => {
  it.each(cases)("%s denies a non-CRM user and touches no table", async (_name, run) => {
    let outcome: unknown;
    try { outcome = await run(); } catch (e) { outcome = { error: (e as Error).message }; }
    expect(outcome).toEqual({ error: DENIED });
    expect(calls).toEqual([]);
  });

  it("covers every export", () => {
    const exported = [companies, persons, deals, quotes, customFields].flatMap((m) => Object.keys(m));
    expect(cases.map((c) => c[0]).sort()).toEqual(exported.sort());
  });
});
