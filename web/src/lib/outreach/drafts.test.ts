import { describe, expect, it } from "vitest";
import {
  DRAFT_STATUSES,
  MAX_BULK_DRAFTS,
  MAX_STEP,
  canApprove,
  canEdit,
  canSend,
  draftsUpsertSchema,
  isDraftStatus,
  isValidStep,
  threadKeyFor,
  validateUpsert,
  withFooter,
  type DraftStatus,
} from "./drafts";

const validDraft = {
  companyId: 12,
  campaign: "BirdsView Q4",
  step: 1,
  subject: "Hi there",
  body: "Some body text",
};

describe("isDraftStatus", () => {
  it("accepts every known status", () => {
    for (const s of DRAFT_STATUSES) expect(isDraftStatus(s)).toBe(true);
  });
  it("rejects unknown values", () => {
    expect(isDraftStatus("bogus")).toBe(false);
    expect(isDraftStatus(1)).toBe(false);
    expect(isDraftStatus(undefined)).toBe(false);
  });
});

describe("isValidStep", () => {
  it("accepts 1..MAX_STEP", () => {
    for (let i = 1; i <= MAX_STEP; i++) expect(isValidStep(i)).toBe(true);
  });
  it("rejects out of range, non-integers, non-numbers", () => {
    expect(isValidStep(0)).toBe(false);
    expect(isValidStep(5)).toBe(false);
    expect(isValidStep(1.5)).toBe(false);
    expect(isValidStep("1")).toBe(false);
    expect(isValidStep(undefined)).toBe(false);
  });
});

describe("state machine predicates", () => {
  const expected: Record<DraftStatus, { edit: boolean; approve: boolean; send: boolean }> = {
    draft: { edit: true, approve: true, send: false },
    approved: { edit: false, approve: false, send: true },
    sending: { edit: false, approve: false, send: false },
    sent: { edit: false, approve: false, send: false },
    failed: { edit: true, approve: false, send: true },
    replied: { edit: false, approve: false, send: false },
    cancelled: { edit: false, approve: false, send: false },
  };

  for (const status of DRAFT_STATUSES) {
    it(`${status}: canEdit/canApprove/canSend`, () => {
      const e = expected[status];
      expect(canEdit(status)).toBe(e.edit);
      expect(canApprove(status)).toBe(e.approve);
      expect(canSend(status)).toBe(e.send);
    });
  }

  it("a sent row can never be edited or re-sent", () => {
    expect(canEdit("sent")).toBe(false);
    expect(canSend("sent")).toBe(false);
  });
});

describe("threadKeyFor", () => {
  it("is deterministic and lowercases/slugifies the campaign", () => {
    expect(threadKeyFor("BirdsView Q4", 12)).toBe("birdsview-q4:12");
  });
  it("collapses non-alphanumerics and trims dashes", () => {
    expect(threadKeyFor("  Q4!! Launch--EU  ", 3)).toBe("q4-launch-eu:3");
  });
  it("is stable across repeated calls", () => {
    expect(threadKeyFor("Campaign X", 7)).toBe(threadKeyFor("Campaign X", 7));
  });
  it("falls back to 'campaign' when the slug is empty", () => {
    expect(threadKeyFor("!!!", 9)).toBe("campaign:9");
    expect(threadKeyFor("", 9)).toBe("campaign:9");
    expect(threadKeyFor("   ", 9)).toBe("campaign:9");
  });
});

describe("withFooter", () => {
  const footer = "Leiratkozás: reply STOP";

  it("appends the footer with a blank line + separator", () => {
    const out = withFooter("Hello there", footer);
    expect(out).toBe("Hello there\n\n-- \nLeiratkozás: reply STOP");
  });

  it("trims trailing whitespace off the body first", () => {
    const out = withFooter("Hello there   \n\n", footer);
    expect(out).toBe("Hello there\n\n-- \nLeiratkozás: reply STOP");
  });

  it("is idempotent: applying twice changes nothing further", () => {
    const once = withFooter("Hello there", footer);
    const twice = withFooter(once, footer);
    expect(twice).toBe(once);
  });

  it("does nothing when the footer is null/undefined/empty", () => {
    expect(withFooter("Hello there", null)).toBe("Hello there");
    expect(withFooter("Hello there", undefined)).toBe("Hello there");
    expect(withFooter("Hello there", "   ")).toBe("Hello there");
  });
});

describe("validateUpsert", () => {
  it("accepts a valid draft", () => {
    const result = validateUpsert(validDraft);
    expect(result.ok).toBe(true);
  });

  it("rejects a non-positive companyId", () => {
    const result = validateUpsert({ ...validDraft, companyId: 0 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/companyId/);
  });

  it("rejects an empty campaign", () => {
    const result = validateUpsert({ ...validDraft, campaign: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/campaign/);
  });

  it("rejects a campaign over 80 chars", () => {
    const result = validateUpsert({ ...validDraft, campaign: "x".repeat(81) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/campaign/);
  });

  it("rejects step out of 1..4", () => {
    const result = validateUpsert({ ...validDraft, step: 5 });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/step/);
  });

  it("rejects an empty subject", () => {
    const result = validateUpsert({ ...validDraft, subject: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/subject/);
  });

  it("rejects a subject over 300 chars", () => {
    const result = validateUpsert({ ...validDraft, subject: "x".repeat(301) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/subject/);
  });

  it("rejects an empty body", () => {
    const result = validateUpsert({ ...validDraft, body: "" });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/body/);
  });

  it("rejects a body over 20000 chars", () => {
    const result = validateUpsert({ ...validDraft, body: "x".repeat(20001) });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.error).toMatch(/body/);
  });

  it("rejects an invalid toEmail but allows null/undefined", () => {
    const bad = validateUpsert({ ...validDraft, toEmail: "not-an-email" });
    expect(bad.ok).toBe(false);
    if (!bad.ok) expect(bad.error).toMatch(/toEmail/);

    expect(validateUpsert({ ...validDraft, toEmail: null }).ok).toBe(true);
    expect(validateUpsert({ ...validDraft, toEmail: undefined }).ok).toBe(true);
    expect(validateUpsert({ ...validDraft, toEmail: "a@b.com" }).ok).toBe(true);
  });
});

describe("draftsUpsertSchema bulk cap", () => {
  it("accepts exactly MAX_BULK_DRAFTS items", () => {
    const batch = Array.from({ length: MAX_BULK_DRAFTS }, () => validDraft);
    expect(draftsUpsertSchema.safeParse(batch).success).toBe(true);
  });

  it("rejects more than MAX_BULK_DRAFTS items", () => {
    const batch = Array.from({ length: MAX_BULK_DRAFTS + 1 }, () => validDraft);
    expect(draftsUpsertSchema.safeParse(batch).success).toBe(false);
  });
});
