import { describe, it, expect, vi, beforeEach } from "vitest";

const { db } = vi.hoisted(() => ({
  db: {
    emailDraft: { findFirst: vi.fn(), updateMany: vi.fn() },
    suppression: { findMany: vi.fn() },
    contact: { findFirst: vi.fn() },
    tenant: { findUnique: vi.fn() },
  },
}));

vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn(), NOT_A_CRM_USER: "NOT_A_CRM_USER" }));
vi.mock("@/lib/marketing/audience-query", () => ({ countAudience: vi.fn() }));
vi.mock("@/lib/outreach/registry", () => ({ campaignBySlug: vi.fn(), resolveAudience: vi.fn() }));
vi.mock("@/lib/automations/engine", () => ({ runAutomations: vi.fn() }));
vi.mock("@/lib/leads/ingest", () => ({ ingestLead: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/outreach/template", () => ({
  gateDraft: vi.fn(async () => ({ ok: true })),
  gateOn: vi.fn(),
  templatesForCampaigns: vi.fn(),
}));

import { getActor } from "@/lib/actor";
import { SUPPRESSED_ERROR } from "@/lib/suppression";
import { getDraftBody } from "@/app/actions/email-drafts";
import { markDraftSentManually } from "@/app/actions/outreach-campaigns";

beforeEach(() => {
  vi.clearAllMocks();
  (getActor as unknown as ReturnType<typeof vi.fn>).mockResolvedValue({ userId: 2, email: "a@x.hu" });
  db.suppression.findMany.mockResolvedValue([{ email: null, domain: "tilos.hu" }]);
});

describe("suppressed recipient", () => {
  it("getDraftBody refuses and returns no body", async () => {
    db.emailDraft.findFirst.mockResolvedValue({ body: "secret", campaign: "w1", step: 1, toEmail: "x@tilos.hu" });
    expect(await getDraftBody(1)).toEqual({ ok: false, error: SUPPRESSED_ERROR });
  });

  it("getDraftBody still serves a clean address", async () => {
    db.emailDraft.findFirst.mockResolvedValue({ body: "hi", campaign: "w1", step: 1, toEmail: "x@ok.hu" });
    expect(await getDraftBody(1)).toEqual({ ok: true, body: "hi" });
  });

  it("markDraftSentManually refuses before booking anything", async () => {
    db.emailDraft.findFirst.mockResolvedValue({ id: 1, status: "approved", campaign: "w1", step: 1, toEmail: "X@Iroda.Tilos.hu" });
    const res = await markDraftSentManually({ draftId: 1 });
    expect(res).toEqual({ ok: false, error: SUPPRESSED_ERROR });
    expect(db.emailDraft.updateMany).not.toHaveBeenCalled();
  });
});
