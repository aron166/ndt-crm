import { describe, it, expect, vi, beforeEach } from "vitest";
import { reportError } from "@/lib/report-error";
import { db } from "@/lib/db";
import { getResendConfig, sendEmail } from "@/lib/integrations/resend";
import { formAlertText, sendFormAlert } from "./form-alert";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ getResendConfig: vi.fn(), sendEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    tenant: { findUnique: vi.fn() },
    lead: { findFirst: vi.fn() },
    user: { findMany: vi.fn() },
    appEvent: { create: vi.fn() },
  },
}));

const d = vi.mocked(db, true);

describe("formAlertText", () => {
  it("has name, phone, answers, call window and the lead link", () => {
    const { subject, text } = formAlertText({
      id: 12, company: "ZMT", contactName: "Kiss Anna", email: "a@b.hu", phone: "+36301234567",
      intent: "demo", callWindow: "délután", message: null, answers: { size: "500 m2", empty: "" }, tier: null,
    }, "https://x.test");
    expect(subject).toContain("Kiss Anna");
    expect(text).toContain("Kiss Anna");
    expect(text).toContain("+36301234567");
    expect(text).toContain("- size: 500 m2");
    expect(text).not.toContain("- empty");
    expect(text).toContain("délután");
    expect(text).toContain("https://x.test/leads/12");
  });

  it("prints non-string answers as JSON", () => {
    const { text } = formAlertText({
      id: 1, company: null, contactName: null, email: null, phone: null,
      intent: null, callWindow: null, message: null, answers: { opts: { a: 1 } }, tier: null,
    }, "https://x.test");
    expect(text).toContain('- opts: {"a":1}');
  });
});

describe("sendFormAlert", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    d.tenant.findUnique.mockResolvedValue({ settings: { demoHosts: { aron: 1, peter: 2 } } } as never);
    d.lead.findFirst.mockResolvedValue({
      id: 12, intent: null, message: null, qualification: { call_window: "reggel" }, customFields: { contact_email: "lead@x.hu" },
      tier: null, company: { name: "ZMT" }, contact: { email: null, phone: "1", person: null },
    } as never);
    d.user.findMany.mockResolvedValue([{ email: "aron@crm.hu" }, { email: "peter@crm.hu" }] as never);
    vi.mocked(sendEmail).mockResolvedValue({ ok: true } as never);
  });

  it("is a no-op without Resend config", async () => {
    vi.mocked(getResendConfig).mockResolvedValue(null);
    expect(await sendFormAlert(1, 12)).toEqual({ sent: 0 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("sends only to the demoHosts users, never to the lead", async () => {
    vi.mocked(getResendConfig).mockResolvedValue({} as never);
    expect(await sendFormAlert(1, 12)).toEqual({ sent: 2 });
    expect(vi.mocked(sendEmail).mock.calls.map((c) => c[0].to)).toEqual(["aron@crm.hu", "peter@crm.hu"]);
    expect(d.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { tenantId: 1, id: { in: [1, 2] } } }));
  });

  it("reports when no recipients resolve", async () => {
    vi.mocked(getResendConfig).mockResolvedValue({} as never);
    d.tenant.findUnique.mockResolvedValue({ settings: {} } as never);
    expect(await sendFormAlert(1, 12)).toEqual({ sent: 0 });
    expect(reportError).toHaveBeenCalledWith("leads.formAlert.noRecipients", expect.any(Error), { leadId: 12 });
  });
});

describe("delivery trace (Kai 2026-11-09)", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(getResendConfig).mockResolvedValue({ apiKey: "k", fromEmail: "f@x.hu", fromName: null });
    d.tenant.findUnique.mockResolvedValue({ settings: { demoHosts: { peter: 3, aron: 2 } } } as never);
    d.lead.findFirst.mockResolvedValue({ id: 22, intent: null, message: null, qualification: {}, customFields: {}, tier: null, company: null, contact: null } as never);
    d.user.findMany.mockResolvedValue([{ id: 3, email: "p@x.hu" }, { id: 2, email: "a@x.hu" }] as never);
  });

  it("writes one form_alert_sent event with the Resend id per recipient, or the error", async () => {
    vi.mocked(sendEmail).mockResolvedValueOnce({ ok: true, id: "re_1" }).mockResolvedValueOnce({ ok: false, error: "rate limit" });
    expect(await sendFormAlert(1, 22)).toEqual({ sent: 1 });
    expect(d.appEvent.create).toHaveBeenCalledTimes(1);
    const data = d.appEvent.create.mock.calls[0][0].data as { eventType: string; payload: unknown };
    expect(data.eventType).toBe("form_alert_sent");
    expect(data.payload).toEqual({
      leadId: 22, sent: 1, recipients: 2,
      results: [{ userId: 3, ok: true, resendId: "re_1" }, { userId: 2, ok: false, error: "rate limit" }],
    });
    expect(JSON.stringify(data.payload)).not.toContain("@");
  });

  it("a failing trace never breaks the alert", async () => {
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "re_2" });
    d.appEvent.create.mockRejectedValueOnce(new Error("db down"));
    expect(await sendFormAlert(1, 22)).toEqual({ sent: 2 });
    expect(reportError).toHaveBeenCalledWith("leads.formAlert.trace", expect.any(Error), { leadId: 22 });
  });
});
