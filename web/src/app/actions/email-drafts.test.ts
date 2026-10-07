import { describe, it, expect, vi } from "vitest";
import { db } from "@/lib/db";
import { getDraftBody } from "./email-drafts";
import { SUPPRESSED_ERROR } from "@/lib/suppression";

vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }));
vi.mock("@/lib/actor", () => ({ getActor: vi.fn().mockResolvedValue({ userId: 2 }), isCrmUser: vi.fn().mockResolvedValue(true), NOT_A_CRM_USER: "x" }));
vi.mock("@/lib/audit", () => ({ audit: vi.fn() }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/db", () => ({
  db: {
    emailDraft: { findFirst: vi.fn() },
    contact: { findFirst: vi.fn() },
    suppression: { findMany: vi.fn() },
    contentItem: { findFirst: vi.fn().mockResolvedValue(null) },
  },
}));

const m = db as unknown as Record<string, Record<string, ReturnType<typeof vi.fn>>>;

describe("getDraftBody", () => {
  it("refuses when toEmail is null and the resolved person email is suppressed", async () => {
    m.emailDraft.findFirst.mockResolvedValue({ body: "b", campaign: "c", step: 1, toEmail: null, personId: 5, companyId: 10 });
    m.contact.findFirst.mockResolvedValue({ email: null, person: { email: "nem@tilos.hu" } });
    m.suppression.findMany.mockResolvedValue([{ email: null, domain: "tilos.hu" }]);
    expect(await getDraftBody(1)).toEqual({ ok: false, error: SUPPRESSED_ERROR });
  });
});
