import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { NextRequest } from "next/server";

// /api/booking route tests: the gate, input validation, and the route check on
// the write. The pure math has its own tests in lib/booking.

const { db, audit, getActor } = vi.hoisted(() => ({
  db: {
    huSettlement: { findMany: vi.fn(), findUnique: vi.fn() },
    equipment: { findMany: vi.fn() },
    tenant: { findUnique: vi.fn() },
    task: { findMany: vi.fn(), create: vi.fn() },
    lead: { findFirst: vi.fn() },
    user: { findFirst: vi.fn() },
  },
  audit: vi.fn(),
  getActor: vi.fn(),
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ audit }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor, NOT_A_CRM_USER: "NOT_A_CRM_USER" }));

import { GET as settlementsGET } from "@/app/api/booking/settlements/route";
import { GET as machinesGET } from "@/app/api/booking/machines/route";
import { GET as siteGET } from "@/app/api/booking/leads/[id]/site/route";
import { POST as slotsPOST } from "@/app/api/booking/slots/route";
import { POST as checkPOST } from "@/app/api/booking/check/route";
import { POST as bookingsPOST } from "@/app/api/booking/bookings/route";

const req = (path: string, body?: unknown) =>
  new NextRequest(`http://localhost/api/booking/${path}`, body === undefined ? { method: "GET" } : { method: "POST", body: JSON.stringify(body) });

const settlements: Record<number, object> = {
  1235: { id: 1235, name: "Debrecen", county: "Hajdú-Bihar", district: null, lat: 47.5333, lng: 21.6333, postcodes: ["4024"] },
  3001: { id: 3001, name: "Zalaegerszeg", county: "Zala", district: null, lat: 46.8417, lng: 16.8416, postcodes: ["8900"] },
  1184: { id: 1184, name: "Sopron", county: "Győr-Moson-Sopron", district: null, lat: 47.685, lng: 16.5905, postcodes: ["9400"] },
};
const machine = {
  id: 1, name: "BetonRadar 1",
  baseSettlement: { id: 1884, name: "Erd", county: "Pest", district: null, lat: 47.3949, lng: 18.9136, postcodes: ["2030"] },
};
const debrecenTask = {
  id: 50, title: "Demó: Debrecen", startsAt: new Date("2026-11-25T13:00:00Z"), estimatedMinutes: 90,
  bookingKind: "single_machine_demo", equipmentId: 1, leadId: 9,
  siteSettlement: { id: 1235, name: "Debrecen", lat: 47.5333, lng: 21.6333 },
};
const lead = { id: 5, outcome: "open", companyId: null, assignedToId: 7, contact: null, company: { name: "Teszt Kft" } };

const impossible = { leadId: 5, settlementId: 3001, siteSource: "stated", kind: "single_machine_demo", startsAt: "2026-11-25T16:00:00+01:00" };

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-11-20T09:00:00Z"));
  for (const t of Object.values(db)) for (const f of Object.values(t)) f.mockReset();
  audit.mockReset();
  getActor.mockReset();
  getActor.mockResolvedValue({ userId: 7, email: "a@b.hu" });
  db.equipment.findMany.mockResolvedValue([machine]);
  db.tenant.findUnique.mockResolvedValue({ settings: null });
  db.huSettlement.findUnique.mockImplementation(async ({ where }: { where: { id: number } }) => settlements[where.id] ?? null);
  db.task.findMany.mockResolvedValue([]);
  db.task.create.mockResolvedValue({ id: 900 });
  db.lead.findFirst.mockResolvedValue(lead);
});
afterEach(() => vi.useRealTimers());

describe("gate", () => {
  it("403 on every route for a non-CRM user, no db access", async () => {
    getActor.mockResolvedValue({ userId: null });
    const rs = await Promise.all([
      settlementsGET(req("settlements?q=9400")),
      machinesGET(),
      siteGET(req("leads/5/site"), { params: Promise.resolve({ id: "5" }) }),
      slotsPOST(req("slots", { settlementId: 1235 })),
      checkPOST(req("check", { settlementId: 1235, startsAt: "2026-11-25T15:00:00+01:00" })),
      bookingsPOST(req("bookings", impossible)),
    ]);
    expect(rs.map((r) => r.status)).toEqual([403, 403, 403, 403, 403, 403]);
    for (const t of Object.values(db)) for (const f of Object.values(t)) expect(f).not.toHaveBeenCalled();
  });
});

describe("slots", () => {
  it("400 on an invalid body", async () => {
    expect((await slotsPOST(req("slots", { settlementId: "x" }))).status).toBe(400);
  });
});

describe("check", () => {
  it("impossible time: infeasible, with feasible alternatives", async () => {
    db.task.findMany.mockResolvedValue([debrecenTask]);
    const res = await checkPOST(req("check", { settlementId: 3001, startsAt: "2026-11-25T16:00:00+01:00", kind: "single_machine_demo" }));
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.feasible).toBe(false);
    expect(body.machines[0].flags.some((f: { code: string; leg?: string }) => f.code === "infeasible" && f.leg === "before")).toBe(true);
    expect(body.alternatives.length).toBeGreaterThan(0);
    for (const a of body.alternatives) expect(a.feasible).toBe(true);
  });

  it("scopes task and equipment queries to the tenant", async () => {
    await checkPOST(req("check", { settlementId: 3001, startsAt: "2026-11-25T16:00:00+01:00", kind: "single_machine_demo" }));
    expect(db.task.findMany.mock.calls[0][0].where.tenantId).toBe(1);
    expect(db.equipment.findMany.mock.calls[0][0].where.tenantId).toBe(1);
  });
});

describe("bookings", () => {
  beforeEach(() => db.task.findMany.mockResolvedValue([debrecenTask]));

  it("409 with the check when the time is impossible and no reason is given", async () => {
    const res = await bookingsPOST(req("bookings", impossible));
    expect(res.status).toBe(409);
    expect((await res.json()).check).toBeDefined();
    expect(db.task.create).not.toHaveBeenCalled();
  });

  it("201 with overrideReason, stored on the task", async () => {
    const res = await bookingsPOST(req("bookings", { ...impossible, overrideReason: "customer comes to us" }));
    expect(res.status).toBe(201);
    expect(db.task.create).toHaveBeenCalledTimes(1);
    expect(db.task.create.mock.calls[0][0].data).toMatchObject({
      equipmentId: 1, siteSettlementId: 3001, overrideReason: "customer comes to us", tenantId: 1,
    });
  });

  it("201 for a feasible time, no override stored", async () => {
    db.task.findMany.mockResolvedValue([]);
    const res = await bookingsPOST(req("bookings", { ...impossible, settlementId: 1184, startsAt: "2026-11-26T10:00:00+01:00" }));
    expect(res.status).toBe(201);
    expect(db.task.create.mock.calls[0][0].data.overrideReason).toBeNull();
  });

  it("404 when the lead is not in the tenant", async () => {
    db.lead.findFirst.mockResolvedValue(null);
    expect((await bookingsPOST(req("bookings", impossible))).status).toBe(404);
    expect(db.lead.findFirst.mock.calls[0][0].where).toMatchObject({ tenantId: 1 });
  });

  it("400 for an unknown machine", async () => {
    expect((await bookingsPOST(req("bookings", { ...impossible, machineId: 99 }))).status).toBe(400);
  });
});

describe("settlements", () => {
  it("a postcode searches postcodes.has", async () => {
    db.huSettlement.findMany.mockResolvedValue([settlements[1184]]);
    const res = await settlementsGET(req("settlements?q=9400"));
    expect(res.status).toBe(200);
    expect(db.huSettlement.findMany.mock.calls[0][0].where.postcodes.has).toBe("9400");
  });

  it("a one-letter query returns [] without a db call", async () => {
    const res = await settlementsGET(req("settlements?q=S"));
    expect((await res.json()).settlements).toEqual([]);
    expect(db.huSettlement.findMany).not.toHaveBeenCalled();
  });
});
