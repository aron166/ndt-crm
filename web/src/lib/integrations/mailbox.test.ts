// @vitest-environment node
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import net from "node:net";

vi.mock("server-only", () => ({}));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    interaction: { create: vi.fn().mockResolvedValue({ id: 1 }) },
    company: { updateMany: vi.fn().mockResolvedValue({ count: 1 }) },
  },
}));
vi.mock("@/lib/enrichment/recompute", () => ({ recomputeCloseness: vi.fn() }));
vi.mock("@/lib/suppression", () => ({
  isAddressSuppressed: vi.fn().mockResolvedValue(false),
  SUPPRESSED_ERROR: "tiltva",
}));

import { db } from "@/lib/db";
import { isAddressSuppressed } from "@/lib/suppression";
import { mailboxConfig, sendViaMailbox, type MailboxConfig } from "./mailbox";
import { startFakeSmtp, type FakeSmtp } from "@/test/fake-smtp";

const PASS = "s3cret-app-pass-xyz";
const base = { CAMPAIGN_SMTP_HOST: "h", CAMPAIGN_SMTP_USER: "u@x.test", CAMPAIGN_SMTP_PASS: "p" };

describe("mailboxConfig", () => {
  it("is null when host, user or pass is missing or empty", () => {
    expect(mailboxConfig({})).toBeNull();
    for (const k of Object.keys(base)) {
      expect(mailboxConfig({ ...base, [k]: undefined })).toBeNull();
      expect(mailboxConfig({ ...base, [k]: "" })).toBeNull();
    }
  });
  it("defaults to port 465, secure, cap 30", () => {
    expect(mailboxConfig(base)).toMatchObject({ host: "h", port: 465, secure: true, user: "u@x.test", pass: "p", dailyCap: 30 });
  });
  it("port 587 is not secure", () => {
    expect(mailboxConfig({ ...base, CAMPAIGN_SMTP_PORT: "587" })).toMatchObject({ port: 587, secure: false });
  });
  it("daily cap: invalid or zero falls back to 30, valid is used", () => {
    expect(mailboxConfig({ ...base, CAMPAIGN_SMTP_DAILY_CAP: "abc" })?.dailyCap).toBe(30);
    expect(mailboxConfig({ ...base, CAMPAIGN_SMTP_DAILY_CAP: "0" })?.dailyCap).toBe(30);
    expect(mailboxConfig({ ...base, CAMPAIGN_SMTP_DAILY_CAP: "45" })?.dailyCap).toBe(45);
  });
});

describe("sendViaMailbox", () => {
  let fake: FakeSmtp | null = null;
  const cfgFor = (port: number): MailboxConfig => ({
    host: "127.0.0.1", port, secure: false, user: "kampany@firm.example.test", pass: PASS, dailyCap: 30,
  });
  const opts = { ignoreTLS: true };
  const input = {
    tenantId: 1, to: "kata@ugyfel.example.test", subject: "Targy teszt", text: "Szia, ez a szoveg.",
    replyTo: "nate@firm.example.test", fromName: "Nate", headers: { "List-Unsubscribe": "<mailto:u@firm.example.test>" },
    companyId: 5, personId: 6,
  };

  beforeEach(() => {
    vi.mocked(db.interaction.create).mockClear();
    vi.mocked(isAddressSuppressed).mockResolvedValue(false);
  });
  afterEach(async () => {
    await fake?.close();
    fake = null;
  });

  it("sends one plain-text message and logs it", async () => {
    fake = await startFakeSmtp();
    const res = await sendViaMailbox(cfgFor(fake.port), input, opts);
    expect(res.ok).toBe(true);
    if (res.ok) expect(res.id).toBeTruthy();
    expect(fake.messages).toHaveLength(1);
    const d = fake.messages[0].data;
    expect(d).toContain("Targy teszt");
    expect(d).toContain("Szia, ez a szoveg.");
    expect(d).toContain("Reply-To:");
    expect(d).toContain("List-Unsubscribe: <mailto:u@firm.example.test>");
    expect(d).not.toContain("text/html");
    expect(fake.authUsers).toContain("kampany@firm.example.test");
    expect(db.interaction.create).toHaveBeenCalledTimes(1);
  });

  it("auth failure: auth true, hint shown, password never leaked, nothing sent or logged", async () => {
    fake = await startFakeSmtp({ rejectAuth: true });
    const res = await sendViaMailbox(cfgFor(fake.port), input, opts);
    expect(res.ok).toBe(false);
    if (!res.ok) {
      expect(res.auth).toBe(true);
      expect(res.error).toContain("alkalmazásjelszó");
      expect(res.error).not.toContain(PASS);
    }
    expect(fake.messages).toHaveLength(0);
    expect(db.interaction.create).not.toHaveBeenCalled();
  });

  it("connection refused: auth false, no throw", async () => {
    const srv = net.createServer();
    await new Promise<void>((r) => srv.listen(0, "127.0.0.1", r));
    const port = (srv.address() as net.AddressInfo).port;
    await new Promise<void>((r) => srv.close(() => r()));
    const res = await sendViaMailbox(cfgFor(port), input, opts);
    expect(res).toMatchObject({ ok: false, auth: false });
  });

  it("suppressed address is refused before reaching the server", async () => {
    fake = await startFakeSmtp();
    vi.mocked(isAddressSuppressed).mockResolvedValue(true);
    const res = await sendViaMailbox(cfgFor(fake.port), input, opts);
    expect(res).toMatchObject({ ok: false, error: "tiltva" });
    expect(fake.messages).toHaveLength(0);
  });

  it("company mailbox without a person name uses the bare user as From", async () => {
    fake = await startFakeSmtp();
    const res = await sendViaMailbox(cfgFor(fake.port), { ...input, to: "info@firm.example.test", fromName: null }, opts);
    expect(res.ok).toBe(true);
    const d = fake!.messages[0].data;
    expect(d).toMatch(/^From: kampany@firm\.example\.test\s*$/m);
  });
});
