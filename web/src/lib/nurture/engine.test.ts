import { describe, it, expect, vi, beforeEach } from "vitest";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/integrations/resend";
import { isAddressSuppressed } from "@/lib/suppression";
import { runNurture } from "./engine";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/suppression", () => ({ isAddressSuppressed: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    tenant: { findUnique: vi.fn() },
    nurtureSequence: { findMany: vi.fn() },
    nurtureTemplate: { findMany: vi.fn() },
    nurtureEnrollment: { findMany: vi.fn(), updateMany: vi.fn(), create: vi.fn() },
    lead: { findMany: vi.fn() },
    interaction: { findMany: vi.fn() },
    task: { findMany: vi.fn() },
    leadStatusHistory: { findMany: vi.fn() },
    appEvent: { create: vi.fn(), findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

const d = vi.mocked(db, true);
const send = vi.mocked(sendEmail);
const suppressed = vi.mocked(isAddressSuppressed);
const now = new Date("2026-11-10T10:00:00Z");

const sequences = [
  { id: 10, segment: "service", active: true, steps: [{ position: 1, delayDays: 0, templateKey: "svc-1", audience: "all" }] },
  { id: 11, segment: "info", active: true, steps: [] },
];
const template = (over: Record<string, unknown> = {}) => ({
  key: "svc-1", subject: "Tárgy", bodyMd: "Szia [x](https://www.betonradar.hu/x)", status: "approved", approvedByAron: true, requiresAsset: null, ...over,
});
const leadRow = (enrollments: unknown[]) => ({
  id: 1, intent: "service_concrete", status: "new", outcome: "open", convertedDealId: null, qualification: null,
  customFields: { contact_email: "Lead@X.hu" }, contact: { email: null }, nurtureEnrollments: enrollments,
});
const live = () => ({
  id: 5, sequenceId: 10, status: "active", nextPosition: 1, enrolledAt: new Date(now.getTime() - 2 * 86_400_000),
  pausedAt: null, resumedAt: null, lastSentAt: null,
  lead: { id: 1, intent: "service_concrete", status: "new", outcome: "open", convertedDealId: null, qualification: null, customFields: { contact_email: "Lead@X.hu" }, companyId: 3, contact: { email: null, personId: 4 }, assignedTo: { name: "Aron" } },
});
const eventTypes = () => d.appEvent.create.mock.calls.map((c) => (c[0].data as { eventType: string }).eventType);

function setup(settings: Record<string, unknown>, templates = [template()]) {
  d.tenant.findUnique.mockResolvedValue({ settings } as never);
  d.nurtureSequence.findMany.mockResolvedValue(sequences as never);
  d.nurtureTemplate.findMany.mockResolvedValue(templates as never);
  d.lead.findMany.mockResolvedValue([leadRow([{ id: 5, sequenceId: 10, status: "active" }])] as never);
  d.nurtureEnrollment.findMany.mockResolvedValue([live()] as never);
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubEnv("ENCRYPTION_KEY", "ab".repeat(32));
  suppressed.mockResolvedValue(false);
  d.interaction.findMany.mockResolvedValue([] as never);
  d.task.findMany.mockResolvedValue([] as never);
  d.leadStatusHistory.findMany.mockResolvedValue([] as never);
  d.appEvent.create.mockResolvedValue({} as never);
  d.nurtureEnrollment.updateMany.mockResolvedValue({ count: 1 } as never);
  d.nurtureEnrollment.create.mockResolvedValue({ id: 77 } as never);
  send.mockResolvedValue({ ok: true, id: "re_123" } as never);
});

describe("runNurture", () => {
  it("skips with nurture_disabled and never sends", async () => {
    setup({ nurture_enabled: false });
    const r = await runNurture(1, now);
    expect(send).not.toHaveBeenCalled();
    expect(r.skipped).toBe(1);
    const ev = d.appEvent.create.mock.calls.map((c) => c[0].data as { eventType: string; payload: { reason?: string } });
    expect(ev.find((e) => e.eventType === "nurture_skipped")?.payload.reason).toBe("nurture_disabled");
  });

  it("does not log the same skip again within 6 days", async () => {
    setup({ nurture_enabled: false });
    d.appEvent.findFirst.mockResolvedValueOnce({ id: 1 } as never);
    await runNurture(1, now);
    expect(send).not.toHaveBeenCalled();
    const kinds = d.appEvent.create.mock.calls.map((c) => (c[0].data as { eventType: string }).eventType);
    expect(kinds).not.toContain("nurture_skipped");
  });

  it("sends once with unsubscribe headers and html, records the send", async () => {
    setup({ nurture_enabled: true });
    const r = await runNurture(1, now);
    expect(r.sent).toBe(1);
    expect(send).toHaveBeenCalledTimes(1);
    const arg = send.mock.calls[0][0];
    expect(arg.to).toBe("Lead@X.hu");
    expect(arg.html).toContain("<p>");
    expect(arg.headers?.["List-Unsubscribe"]).toMatch(/^<.*\/api\/nurture\/unsubscribe\?d=.+&s=.+>$/);
    expect(arg.headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
    expect(d.nurtureEnrollment.updateMany).toHaveBeenCalledWith({
      where: { id: 5, tenantId: 1, status: "active", nextPosition: 1 },
      data: { nextPosition: 2, lastSentAt: now },
    });
    const sent = d.appEvent.create.mock.calls.map((c) => c[0].data as { eventType: string; payload: { resendId?: string } })
      .find((e) => e.eventType === "nurture_sent");
    expect(sent?.payload.resendId).toBe("re_123");
  });

  it("skips an unapproved template", async () => {
    setup({ nurture_enabled: true }, [template({ status: "proposal", approvedByAron: false })]);
    await runNurture(1, now);
    expect(send).not.toHaveBeenCalled();
    const ev = d.appEvent.create.mock.calls.map((c) => c[0].data as { eventType: string; payload: { reason?: string } });
    expect(ev.find((e) => e.eventType === "nurture_skipped")?.payload.reason).toBe("not_approved");
  });

  it("stops the enrollment of a suppressed address", async () => {
    setup({ nurture_enabled: true });
    suppressed.mockResolvedValue(true);
    const r = await runNurture(1, now);
    expect(send).not.toHaveBeenCalled();
    expect(r.stopped).toBe(1);
    expect(d.nurtureEnrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "stopped", stoppedReason: "unsubscribed" } }),
    );
  });

  it("stops the old enrollment and creates a new one when the segment changed", async () => {
    setup({ nurture_enabled: true });
    d.lead.findMany.mockResolvedValue([leadRow([{ id: 99, sequenceId: 11, status: "active" }])] as never);
    d.nurtureEnrollment.findMany.mockResolvedValue([] as never);
    const r = await runNurture(1, now);
    expect(d.nurtureEnrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { id: 99, tenantId: 1 }, data: { status: "stopped", stoppedReason: "segment_changed" } }),
    );
    expect(d.nurtureEnrollment.create).toHaveBeenCalledWith({ data: { tenantId: 1, leadId: 1, sequenceId: 10, enrolledAt: now } });
    expect(r).toMatchObject({ stopped: 1, enrolled: 1 });
    expect(eventTypes()).toEqual(expect.arrayContaining(["nurture_stopped", "nurture_enrolled"]));
    expect(send).not.toHaveBeenCalled();
  });

  it("does not send when the claim count is 0", async () => {
    setup({ nurture_enabled: true });
    d.nurtureEnrollment.updateMany.mockResolvedValue({ count: 0 } as never);
    const r = await runNurture(1, now);
    expect(send).not.toHaveBeenCalled();
    expect(r.sent).toBe(0);
  });

  it("releases the claim and logs send_failed when the send fails", async () => {
    setup({ nurture_enabled: true });
    send.mockResolvedValue({ ok: false, error: "boom" } as never);
    const r = await runNurture(1, now);
    expect(r.skipped).toBe(1);
    expect(d.nurtureEnrollment.updateMany).toHaveBeenCalledWith({
      where: { id: 5, tenantId: 1, nextPosition: 2 },
      data: { nextPosition: 1, lastSentAt: null },
    });
    const ev = d.appEvent.create.mock.calls.map((c) => c[0].data as { eventType: string; payload: { reason?: string } });
    expect(ev.find((e) => e.eventType === "nurture_skipped")?.payload.reason).toBe("send_failed");
  });

  it("stops a live enrollment whose lead became won, without sending", async () => {
    setup({ nurture_enabled: true });
    const en = live();
    en.lead.status = "won";
    d.nurtureEnrollment.findMany.mockResolvedValue([en] as never);
    const r = await runNurture(1, now);
    expect(send).not.toHaveBeenCalled();
    expect(r.stopped).toBe(1);
    expect(d.nurtureEnrollment.updateMany).toHaveBeenCalledWith(
      expect.objectContaining({ data: { status: "stopped", stoppedReason: "not_eligible" } }),
    );
  });

  it("passes a missing template when sending is on, but waits on an unapproved one", async () => {
    setup({ nurture_enabled: true }, []);
    await runNurture(1, now);
    expect(send).not.toHaveBeenCalled();
    expect(d.nurtureEnrollment.updateMany).toHaveBeenCalledWith({ where: { id: 5, tenantId: 1 }, data: { nextPosition: 2 } });

    vi.clearAllMocks();
    d.nurtureEnrollment.updateMany.mockResolvedValue({ count: 1 } as never);
    d.appEvent.create.mockResolvedValue({} as never);
    d.interaction.findMany.mockResolvedValue([] as never);
    d.task.findMany.mockResolvedValue([] as never);
    d.leadStatusHistory.findMany.mockResolvedValue([] as never);
    d.appEvent.findFirst.mockResolvedValue(null as never);
    suppressed.mockResolvedValue(false);
    setup({ nurture_enabled: true }, [template({ status: "proposal", approvedByAron: false })]);
    await runNurture(1, now);
    expect(d.nurtureEnrollment.updateMany).not.toHaveBeenCalledWith(expect.objectContaining({ data: { nextPosition: 2 } }));
  });

  it("a self-transition in the status history does not pause, a real move does", async () => {
    setup({ nurture_enabled: true });
    const at = new Date(now.getTime() - 3_600_000);
    d.leadStatusHistory.findMany.mockResolvedValue([{ at, fromStatus: "new", toStatus: "new" }] as never);
    const r1 = await runNurture(1, now);
    expect(r1.paused).toBe(0);
    expect(r1.sent).toBe(1);

    vi.clearAllMocks();
    d.nurtureEnrollment.updateMany.mockResolvedValue({ count: 1 } as never);
    d.appEvent.create.mockResolvedValue({} as never);
    d.interaction.findMany.mockResolvedValue([] as never);
    d.task.findMany.mockResolvedValue([] as never);
    d.appEvent.findFirst.mockResolvedValue(null as never);
    suppressed.mockResolvedValue(false);
    send.mockResolvedValue({ ok: true, id: "re_1" } as never);
    setup({ nurture_enabled: true });
    d.leadStatusHistory.findMany.mockResolvedValue([{ at, fromStatus: "new", toStatus: "contacted" }] as never);
    const r2 = await runNurture(1, now);
    expect(r2.paused).toBe(1);
    expect(send).not.toHaveBeenCalled();
  });
});
