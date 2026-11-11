import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { signPayload } from "@/lib/nurture/token";
import * as unsub from "./unsubscribe/route";
import * as click from "./click/route";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    suppression: { findFirst: vi.fn(), create: vi.fn() },
    nurtureEnrollment: { updateMany: vi.fn() },
    appEvent: { create: vi.fn() },
    lead: { findFirst: vi.fn() },
    task: { findFirst: vi.fn(), create: vi.fn() },
  },
}));

const d = vi.mocked(db, true);
const HOME = "https://www.betonradar.hu/";

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
  d.suppression.findFirst.mockResolvedValue(null as never);
  d.lead.findFirst.mockResolvedValue({ id: 1, assignedToId: 2, companyId: 3, contact: { personId: 4 } } as never);
  d.task.findFirst.mockResolvedValue(null as never);
});

const writes = () => [
  d.suppression.create, d.nurtureEnrollment.updateMany, d.appEvent.create, d.task.create,
].reduce((n, m) => n + m.mock.calls.length, 0);

describe("unsubscribe route", () => {
  const req = (method: string, q?: string) => {
    const { d: dd, s } = signPayload("unsub", { t: 1, e: "Lead@X.hu", l: 9 });
    return new Request(`https://crm.test/api/nurture/unsubscribe?${q ?? `d=${dd}&s=${s}`}`, { method });
  };

  it("GET with a valid token shows the confirm page and writes nothing", async () => {
    const res = await unsub.GET(req("GET"));
    expect(res.status).toBe(200);
    expect(await res.text()).toContain("Leiratkozom");
    expect(writes()).toBe(0);
  });

  it("POST suppresses, stops enrollments and records the event", async () => {
    const res = await unsub.POST(req("POST"));
    expect(res.status).toBe(200);
    expect(d.suppression.create).toHaveBeenCalledTimes(1);
    expect(d.suppression.create.mock.calls[0][0].data).toMatchObject({ tenantId: 1, email: "lead@x.hu", source: "nurture_unsubscribe" });
    expect(d.nurtureEnrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: expect.objectContaining({ tenantId: 1, leadId: 9 }), data: { status: "stopped", stoppedReason: "unsubscribed" } }),
    );
    expect(d.appEvent.create.mock.calls[0][0].data).toMatchObject({ eventType: "nurture_unsubscribed" });
  });

  it("POST is idempotent when already suppressed", async () => {
    d.suppression.findFirst.mockResolvedValue({ id: 3 } as never);
    const res = await unsub.POST(req("POST"));
    expect(res.status).toBe(200);
    expect(d.suppression.create).not.toHaveBeenCalled();
  });

  it("POST still succeeds when suppression.create races (P2002)", async () => {
    d.suppression.create.mockRejectedValue({ code: "P2002" } as never);
    const res = await unsub.POST(req("POST"));
    expect(res.status).toBe(200);
  });

  it("an invalid token is 400 and writes nothing", async () => {
    expect((await unsub.GET(req("GET", "d=x&s=y"))).status).toBe(400);
    expect((await unsub.POST(req("POST", "d=x&s=y"))).status).toBe(400);
    expect((await unsub.POST(req("POST", ""))).status).toBe(400);
    expect(writes()).toBe(0);
  });
});

describe("click route", () => {
  const url = (u: string) => {
    const { d: dd, s } = signPayload("click", { t: 1, en: 5, l: 1, k: "svc-1", p: 1, u });
    return new Request(`https://crm.test/api/nurture/click?d=${dd}&s=${s}`);
  };

  it("redirects to the destination and records the click, never creating a task", async () => {
    const res = await click.GET(url("https://www.betonradar.hu/x?utm_source=nurture"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe("https://www.betonradar.hu/x?utm_source=nurture");
    expect(d.appEvent.create.mock.calls[0][0].data).toMatchObject({ eventType: "nurture_click" });
    expect(d.task.create).not.toHaveBeenCalled();
  });

  it("a non-betonradar destination goes home", async () => {
    for (const u of ["https://evil.example/x", "http://www.betonradar.hu/x", "https://betonradar.hu.evil.example/"]) {
      const res = await click.GET(url(u));
      expect(res.headers.get("location")).toBe(HOME);
    }
  });

  it("an invalid token redirects home and writes nothing", async () => {
    const res = await click.GET(new Request("https://crm.test/api/nurture/click?d=x&s=y"));
    expect(res.status).toBe(302);
    expect(res.headers.get("location")).toBe(HOME);
    expect(writes()).toBe(0);
  });
});
