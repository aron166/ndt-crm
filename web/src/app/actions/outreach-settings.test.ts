import { describe, it, expect, vi, beforeEach } from "vitest";

// saveOutreachSettings (/outreach inline panel) writes only its own keys, one jsonb_set each,
// like every other tenants.settings editor (inventory 4.F): no read-merge-write of the blob.
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn().mockResolvedValue({ userId: 2 }), isCrmUser: vi.fn().mockResolvedValue(true), NOT_A_CRM_USER: "x" }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/campaigns/service", () => ({ campaignSendBlock: vi.fn(), advanceOnSent: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: { tenant: { findUnique: vi.fn(), update: vi.fn() }, $executeRaw: vi.fn().mockResolvedValue(1) },
}));

import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { getActor } from "@/lib/actor";
import { saveOutreachSettings } from "./email-drafts";

type M = ReturnType<typeof vi.fn>;
const d = db as unknown as { tenant: { findUnique: M; update: M }; $executeRaw: M };

beforeEach(() => {
  vi.clearAllMocks();
  (getActor as unknown as M).mockResolvedValue({ userId: 2 });
  d.tenant.findUnique.mockResolvedValue({ settings: { outreachReplyTo: "old@ceg.hu", scriptVariants: [{ key: "a" }] } });
});

/** The key and value of each jsonb_set the call ran. */
const writes = () => d.$executeRaw.mock.calls.map((c) => ({ key: c[1], value: JSON.parse(c[2]) }));

describe("saveOutreachSettings: own keys only, one jsonb_set each", () => {
  it("never rewrites the whole settings blob", async () => {
    expect(await saveOutreachSettings({ replyTo: "uj@ceg.hu", footer: "Lábléc" })).toEqual({ ok: true });
    expect(d.tenant.update).not.toHaveBeenCalled();
    expect(writes()).toEqual([{ key: "outreachReplyTo", value: "uj@ceg.hu" }, { key: "outreachFooter", value: "Lábléc" }]);
    expect(audit).toHaveBeenCalledWith("tenant", 1, "update", { outreachReplyTo: "old@ceg.hu", outreachFooter: null }, { outreachReplyTo: "uj@ceg.hu", outreachFooter: "Lábléc" });
  });

  it("empty fields clear the key to null", async () => {
    await saveOutreachSettings({ replyTo: " ", footer: "" });
    expect(writes()).toEqual([{ key: "outreachReplyTo", value: null }, { key: "outreachFooter", value: null }]);
  });

  it("a bad reply-to address writes nothing", async () => {
    expect(await saveOutreachSettings({ replyTo: "nem-email", footer: "" })).toMatchObject({ ok: false });
    expect(d.$executeRaw).not.toHaveBeenCalled();
  });

  it("not a CRM user writes nothing", async () => {
    (getActor as unknown as M).mockResolvedValue({ userId: null });
    expect(await saveOutreachSettings({ replyTo: "uj@ceg.hu", footer: "" })).toMatchObject({ ok: false });
    expect(d.$executeRaw).not.toHaveBeenCalled();
  });
});
