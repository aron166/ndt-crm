import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { validateAppKey, rateLimit } from "@/lib/app-key-auth";
import { leadSite, proposeSlotsFor } from "@/lib/booking/route-service";
import { leadSearchWhere } from "@/lib/leads/api";
import { GET as getBookings } from "./bookings/route";
import { GET as getQueue } from "./leads/queue/route";
import { GET as getSlots } from "./leads/[id]/slots/route";
import { GET as getLeads } from "./leads/route";
import { POST as postInteraction } from "./leads/[id]/interactions/route";
import { logLeadCallOutcome } from "@/lib/leads/service";

// The cockpit's read endpoints (peter-cockpit README gaps 1 to 4): app key, tenant from the key, read only.

vi.mock("@/lib/app-key-auth", () => ({ validateAppKey: vi.fn(), rateLimit: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    task: { findMany: vi.fn() },
    lead: { findFirst: vi.fn(), findMany: vi.fn(), count: vi.fn() },
  },
}));
vi.mock("@/lib/booking/route-service", () => ({ leadSite: vi.fn(), proposeSlotsFor: vi.fn() }));
vi.mock("@/lib/leads/service", () => ({ logLeadCallOutcome: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));

const m = db as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;
const mock = <T>(f: T) => f as unknown as ReturnType<typeof vi.fn>;
const get = (url: string) => new Request(`http://x${url}`);
const ctx = (id: string) => ({ params: Promise.resolve({ id }) });

beforeEach(() => {
  vi.clearAllMocks();
  mock(validateAppKey).mockResolvedValue({ keyId: 1, tenantId: 4, appSlug: "cockpit" });
  mock(rateLimit).mockReturnValue(true);
  m.task.findMany.mockResolvedValue([]);
  m.lead.findMany.mockResolvedValue([]);
  m.lead.count.mockResolvedValue(0);
});

describe("auth", () => {
  it("every endpoint refuses a request without a valid key and reads nothing", async () => {
    mock(validateAppKey).mockResolvedValue(null);
    for (const r of [
      await getBookings(get("/api/bookings?from=2026-11-16&to=2026-11-17")),
      await getQueue(get("/api/leads/queue")),
      await getSlots(get("/api/leads/5/slots"), ctx("5")),
      await getLeads(get("/api/leads?q=acme")),
    ]) expect(r.status).toBe(401);
    expect(m.task.findMany).not.toHaveBeenCalled();
    expect(m.lead.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/bookings", () => {
  it("reads the key's tenant, open bookings in [from, to), optional owner", async () => {
    const r = await getBookings(get("/api/bookings?from=2026-11-16T00:00:00Z&to=2026-11-23T00:00:00Z&assigned_to=3"));
    expect(r.status).toBe(200);
    expect(m.task.findMany.mock.calls[0][0].where).toEqual({
      tenantId: 4,
      startsAt: { gte: new Date("2026-11-16T00:00:00Z"), lt: new Date("2026-11-23T00:00:00Z") },
      status: { notIn: ["done", "cancelled"] },
      assignedToId: 3,
    });
  });

  it.each([
    ["/api/bookings?to=2026-11-17", "missing from"],
    ["/api/bookings?from=2026-11-17&to=2026-11-16", "to before from"],
    ["/api/bookings?from=2026-01-01&to=2026-06-01", "range over 62 days"],
  ])("400 on %s (%s)", async (url) => {
    expect((await getBookings(get(url))).status).toBe(400);
    expect(m.task.findMany).not.toHaveBeenCalled();
  });
});

describe("GET /api/leads/queue", () => {
  it("scopes the hívólista to the key's tenant and caps the limit", async () => {
    expect((await getQueue(get("/api/leads/queue?limit=10"))).status).toBe(200);
    const args = m.lead.findMany.mock.calls[0][0];
    expect(args.where).toMatchObject({ tenantId: 4, outcome: "open", convertedDealId: null });
    expect(args.take).toBe(10);
    expect(args.orderBy).toEqual([{ nextDue: { sort: "asc", nulls: "last" } }, { createdAt: "asc" }]);
    expect((await getQueue(get("/api/leads/queue?limit=999"))).status).toBe(400);
  });
});

describe("GET /api/leads/:id/slots", () => {
  it("404 for a lead of another tenant, without proposing", async () => {
    m.lead.findFirst.mockResolvedValue(null);
    expect((await getSlots(get("/api/leads/5/slots"), ctx("5"))).status).toBe(404);
    expect(m.lead.findFirst.mock.calls[0][0].where).toEqual({ id: 5, tenantId: 4 });
    expect(proposeSlotsFor).not.toHaveBeenCalled();
  });

  it("proposes for the lead's site, passing the assumed-site source", async () => {
    m.lead.findFirst.mockResolvedValue({ id: 5 });
    mock(leadSite).mockResolvedValue({ settlement: { id: 77 }, address: null, source: "company_address_assumed" });
    mock(proposeSlotsFor).mockResolvedValue({ site: null, kind: null, minutes: 60, from: new Date(), machines: [], slots: [] });
    const r = await getSlots(get("/api/leads/5/slots?days=7&count=2"), ctx("5"));
    expect(r.status).toBe(200);
    expect(mock(proposeSlotsFor).mock.calls[0]).toEqual([4, { settlementId: 77, siteSource: "company_address_assumed", kind: null, days: 7, count: 2, wanted: undefined }]);
  });
});

describe("GET /api/leads q= and campaign=", () => {
  it("adds the search and the batch tag to the tenant-scoped where", async () => {
    expect((await getLeads(get("/api/leads?q=acme&campaign=launch-2026-11"))).status).toBe(200);
    expect(m.lead.findMany.mock.calls[0][0].where).toEqual({ tenantId: 4, campaign: "launch-2026-11", ...leadSearchWhere("acme") });
  });

  it("searches company, person names, contact email and phone, subject", () => {
    expect(JSON.stringify(leadSearchWhere("kiss"))).toContain('"company":{"name"');
    expect(leadSearchWhere("kiss").OR).toHaveLength(5);
  });

  it("refuses a one-character search (would scan everything)", async () => {
    expect((await getLeads(get("/api/leads?q=a"))).status).toBe(400);
  });
});

describe("POST /api/leads/:id/interactions call_id (the confirmed voice-log route)", () => {
  const post = (body: unknown) => new Request("http://x/api/leads/5/interactions", { method: "POST", body: JSON.stringify(body) });

  it("passes call_id through as the idempotency key", async () => {
    mock(logLeadCallOutcome).mockResolvedValue({ success: true, interactionId: 9 });
    const r = await postInteraction(post({ outcome: "no_answer", note: "x", call_id: "tg-123" }), ctx("5"));
    expect(r.status).toBe(201);
    expect(mock(logLeadCallOutcome).mock.calls[0][1]).toMatchObject({ callId: "tg-123" });
  });

  it("a repeated call_id is a 409, not a 500 and not a second log", async () => {
    mock(logLeadCallOutcome).mockRejectedValue(Object.assign(new Error("unique"), { code: "P2002" }));
    const r = await postInteraction(post({ outcome: "no_answer", note: "x", call_id: "tg-123" }), ctx("5"));
    expect(r.status).toBe(409);
    expect(await r.json()).toMatchObject({ duplicate: true });
  });
});
