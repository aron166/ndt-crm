import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/integrations/resend";
import { autoReplyText, safeName, callWindowLabel, nextStepLine, pingText, sendAutoReply, sendLeadPing, type IntakeFacts } from "./intake-notify";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    tenant: { findUnique: vi.fn() },
    lead: { findFirst: vi.fn() },
    appEvent: { create: vi.fn(), findFirst: vi.fn() },
  },
}));

const d = vi.mocked(db, true);

const facts: IntakeFacts = {
  leadId: 22, name: "Kiss Anna", phone: "+36301234567", email: "a@b.hu",
  intent: "service_concrete", buyerType: "company", callWindow: "8_10", town: "Érd",
};

describe("pingText", () => {
  it("has id, intent label, buyer, phone, call window, town and link", () => {
    const t = pingText(facts, "https://x.test");
    expect(t).toContain("Új űrlapos lead (#22)");
    expect(t).toContain("Szolgáltatás, konkrét feladat");
    expect(t).toContain("cég");
    expect(t).toContain("+36301234567");
    expect(t).toContain("8-10 óra");
    expect(t).toContain("Érd");
    expect(t).toContain("https://x.test/leads/22");
  });
});

describe("callWindowLabel", () => {
  it("passes unknown formats through, dash for null", () => {
    expect(callWindowLabel("délután")).toBe("délután");
    expect(callWindowLabel(null)).toBe("-");
    expect(callWindowLabel("8_10")).toBe("8-10 óra");
  });
});

describe("nextStepLine", () => {
  it("differs per path", () => {
    // device and rental intentionally share one line
    expect(nextStepLine("rental")).toBe(nextStepLine("device"));
    const lines = ["service_concrete", "rental", "info", null].map(nextStepLine);
    expect(new Set(lines).size).toBe(4);
  });
});

describe("autoReplyText", () => {
  it("greets by name, promises the call, signs, no em dash", () => {
    const { subject, text } = autoReplyText(facts);
    expect(text).toContain("Tisztelt Kiss Anna!");
    expect(text).toContain("Nagy Péter kollégánk hamarosan felhívja");
    expect(text).toContain("9:30-ig");
    expect(text).toContain("BetonRadar");
    expect(text).toContain("Uphill Trade Kft.");
    expect(subject + text).not.toContain("\u2014");
  });
  it("falls back to a generic greeting", () => {
    expect(autoReplyText({ name: null, intent: null }).text).toContain("Tisztelt Érdeklődő!");
  });
});

const leadRow = (over: Record<string, unknown> = {}) => ({
  id: 22, intent: "service_concrete", buyerType: "company", companyId: 3,
  qualification: { call_window: "8_10", location: "Érd" },
  customFields: { contact_name: "Kiss Anna", contact_phone: "+36301234567", contact_email: "a@b.hu" },
  contact: { email: null, phone: null, personId: 4 },
  assignedTo: { name: "Nagy Péter" },
  ...over,
});

describe("sendLeadPing", () => {
  const fetchMock = vi.fn();
  beforeEach(() => {
    vi.clearAllMocks();
    vi.stubGlobal("fetch", fetchMock);
    d.lead.findFirst.mockResolvedValue(leadRow() as never);
    d.appEvent.create.mockResolvedValue({} as never);
  });
  afterEach(() => {
    vi.unstubAllEnvs();
    vi.unstubAllGlobals();
  });

  it("is a no-op without env", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "");
    vi.stubEnv("TELEGRAM_LEADS_CHAT_ID", "");
    expect(await sendLeadPing(1, 22)).toEqual({ ok: false });
    expect(fetchMock).not.toHaveBeenCalled();
    expect(d.appEvent.create).not.toHaveBeenCalled();
  });

  it("posts to Telegram and traces the message id", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "tok");
    vi.stubEnv("TELEGRAM_LEADS_CHAT_ID", "-100");
    fetchMock.mockResolvedValue({ ok: true, status: 200, json: async () => ({ ok: true, result: { message_id: 5 } }) });
    expect(await sendLeadPing(1, 22)).toEqual({ ok: true });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    const [url, init] = fetchMock.mock.calls[0] as [string, { method: string; body: string }];
    expect(url).toBe("https://api.telegram.org/bottok/sendMessage");
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body) as { chat_id: string; text: string };
    expect(body.chat_id).toBe("-100");
    expect(body.text).toContain("Új űrlapos lead (#22)");
    expect(d.appEvent.create).toHaveBeenCalledTimes(1);
    const arg = d.appEvent.create.mock.calls[0][0] as { data: { eventType: string; payload: unknown } };
    expect(arg.data.eventType).toBe("lead_ping_sent");
    expect(arg.data.payload).toEqual({ leadId: 22, ok: true, messageId: 5 });
  });

  it("traces a fetch error and does not throw", async () => {
    vi.stubEnv("TELEGRAM_BOT_TOKEN", "tok");
    vi.stubEnv("TELEGRAM_LEADS_CHAT_ID", "-100");
    fetchMock.mockRejectedValue(new Error("network down"));
    expect(await sendLeadPing(1, 22)).toEqual({ ok: false });
    const arg = d.appEvent.create.mock.calls[0][0] as { data: { eventType: string; payload: unknown } };
    expect(arg.data.eventType).toBe("lead_ping_sent");
    expect(arg.data.payload).toEqual({ leadId: 22, ok: false, error: "network down" });
  });
});

describe("sendAutoReply", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    d.lead.findFirst.mockResolvedValue(leadRow() as never);
    d.appEvent.create.mockResolvedValue({} as never);
    d.appEvent.findFirst.mockResolvedValue(null as never);
    vi.mocked(sendEmail).mockResolvedValue({ ok: true, id: "re_1" } as never);
  });

  it("is off without auto_reply_enabled", async () => {
    d.tenant.findUnique.mockResolvedValue({ settings: {} } as never);
    expect(await sendAutoReply(1, 22)).toEqual({ ok: false });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(d.appEvent.create).not.toHaveBeenCalled();
  });

  it("sends once to the lead and traces the resend id", async () => {
    d.tenant.findUnique.mockResolvedValue({ settings: { auto_reply_enabled: true } } as never);
    expect(await sendAutoReply(1, 22)).toEqual({ ok: true });
    expect(sendEmail).toHaveBeenCalledTimes(1);
    expect(sendEmail).toHaveBeenCalledWith(expect.objectContaining({
      to: "a@b.hu", replyTo: "peter@betonradar.hu", fromName: "Nagy Péter",
    }));
    const arg = d.appEvent.create.mock.calls[0][0] as { data: { eventType: string; payload: unknown } };
    expect(arg.data.eventType).toBe("auto_reply_sent");
    expect(arg.data.payload).toMatchObject({ leadId: 22, ok: true, resendId: "re_1" });
    expect(JSON.stringify(arg.data.payload)).not.toContain("@");
  });

  it("only a literal true enables it (Vanda)", async () => {
    for (const v of ["true", 1, null]) {
      d.tenant.findUnique.mockResolvedValue({ settings: { auto_reply_enabled: v } } as never);
      expect(await sendAutoReply(1, 22)).toEqual({ ok: false });
    }
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("a second submission from the same address within 24 h gets no second mail (Vanda #4)", async () => {
    d.tenant.findUnique.mockResolvedValue({ settings: { auto_reply_enabled: true } } as never);
    d.appEvent.findFirst.mockResolvedValue({ id: 1 } as never);
    expect(await sendAutoReply(1, 22)).toEqual({ ok: false });
    expect(sendEmail).not.toHaveBeenCalled();
    const arg = d.appEvent.create.mock.calls[0][0] as unknown as { data: { payload: { error: string } } };
    expect(arg.data.payload.error).toBe("already sent to this address in 24 h");
  });

  it("traces a missing email and sends nothing", async () => {
    d.tenant.findUnique.mockResolvedValue({ settings: { auto_reply_enabled: true } } as never);
    d.lead.findFirst.mockResolvedValue(leadRow({ customFields: {} }) as never);
    expect(await sendAutoReply(1, 22)).toEqual({ ok: false });
    expect(sendEmail).not.toHaveBeenCalled();
    const arg = d.appEvent.create.mock.calls[0][0] as { data: { payload: unknown } };
    expect(arg.data.payload).toEqual({ leadId: 22, ok: false, error: "no email on the lead" });
  });
});

describe("safeName (Vanda #1)", () => {
  it("keeps a normal name, drops links, addresses, long or multi-line text", () => {
    expect(safeName("  Járó   Csaba ")).toBe("Járó Csaba");
    expect(safeName("Kovács\n\nKattintson: http://x.hu")).toBeNull();
    expect(safeName("a@b.hu")).toBeNull();
    expect(safeName("www.valami.hu")).toBeNull();
    expect(safeName("x".repeat(61))).toBeNull();
    expect(autoReplyText({ name: "http://evil", intent: null }).text.startsWith("Tisztelt Érdeklődő!")).toBe(true);
  });
});
