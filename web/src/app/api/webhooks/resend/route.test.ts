import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { createHmac, randomBytes } from "node:crypto";

const m = vi.hoisted(() => ({ proc: vi.fn(), report: vi.fn() }));
vi.mock("@/lib/integrations/resend-webhook", async (orig) => ({
  ...(await orig<typeof import("@/lib/integrations/resend-webhook")>()),
  processResendEvent: m.proc,
}));
vi.mock("@/lib/report-error", () => ({ reportError: m.report }));
vi.mock("@/lib/db", () => ({ db: {} }));

import { POST } from "./route";

const key = randomBytes(32);
const secret = "whsec_" + key.toString("base64");
const fixtures = ["sent", "delivered", "opened", "bounced", "complained"].map((t) => ({
  type: `email.${t}`, created_at: "2026-02-22T23:41:12.126Z",
  data: { email_id: "56761188-7520-42d8-8898-ff6fc54ce618", to: ["delivered@resend.dev"], tags: { category: "confirm_email" } },
}));

function req(body: string, over: Record<string, string> = {}, sig = true) {
  const ts = String(Math.floor(Date.now() / 1000));
  const headers: Record<string, string> = { "svix-id": "msg_1", "svix-timestamp": ts, ...over };
  if (sig && !("svix-signature" in over)) {
    headers["svix-signature"] = "v1," + createHmac("sha256", key).update(`msg_1.${ts}.${body}`).digest("base64");
  }
  return new Request("http://x/api/webhooks/resend", { method: "POST", body, headers });
}

describe("POST /api/webhooks/resend", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.RESEND_WEBHOOK_SECRET = secret;
    m.proc.mockResolvedValue({ duplicate: false, type: "email.sent" });
  });
  afterEach(() => { delete process.env.RESEND_WEBHOOK_SECRET; });

  it("503 without a secret, nothing processed", async () => {
    delete process.env.RESEND_WEBHOOK_SECRET;
    const res = await POST(req("{}"));
    expect(res.status).toBe(503);
    expect(m.proc).not.toHaveBeenCalled();
  });
  it("503 with an empty secret", async () => {
    process.env.RESEND_WEBHOOK_SECRET = "";
    expect((await POST(req("{}"))).status).toBe(503);
  });
  it("401 on a bad signature, nothing processed", async () => {
    const res = await POST(req("{}", { "svix-signature": "v1,AAAA" }));
    expect(res.status).toBe(401);
    expect(m.proc).not.toHaveBeenCalled();
  });
  it("400 on bad JSON with a valid signature", async () => {
    expect((await POST(req("not json"))).status).toBe(400);
    expect(m.proc).not.toHaveBeenCalled();
  });
  it.each(fixtures)("200 for $type", async (f) => {
    m.proc.mockResolvedValue({ duplicate: false, type: f.type });
    const res = await POST(req(JSON.stringify(f)));
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ ok: true, duplicate: false, type: f.type });
    expect(m.proc).toHaveBeenCalledWith(1, "msg_1", f);
  });
  it("500 and reportError when processing throws", async () => {
    m.proc.mockRejectedValue(new Error("db down"));
    expect((await POST(req(JSON.stringify(fixtures[0])))).status).toBe(500);
    expect(m.report).toHaveBeenCalledWith("webhooks.resend", expect.any(Error), expect.anything());
  });
});
