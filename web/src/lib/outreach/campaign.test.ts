import { describe, it, expect } from "vitest";
import {
  dueAtForStep, canMarkSent, canMarkReplied, buildFunnel,
  type FunnelDraftRow, type FunnelLeadRow, type FunnelInteractionRow,
} from "./campaign";
import type { DraftStatus } from "./drafts";

describe("dueAtForStep", () => {
  it("offsets from touch 1's real send time, at 08:00 local", () => {
    const first = new Date(2026, 8, 1, 10, 30); // Sept 1, sent at 10:30
    expect(dueAtForStep(first, 2)).toEqual(new Date(2026, 8, 4, 8, 0, 0, 0));
    expect(dueAtForStep(first, 4)).toEqual(new Date(2026, 8, 15, 8, 0, 0, 0));
  });

  it("returns null past the sequence", () => {
    const first = new Date(2026, 8, 1, 10, 30);
    expect(dueAtForStep(first, 5)).toBeNull();
  });
});

describe("canMarkSent", () => {
  it("allows approved and failed", () => {
    expect(canMarkSent("approved")).toBe(true);
    expect(canMarkSent("failed")).toBe(true);
  });
  it("rejects every other status", () => {
    const rejected: DraftStatus[] = ["draft", "sent", "replied", "cancelled", "sending"];
    for (const s of rejected) expect(canMarkSent(s)).toBe(false);
  });
});

describe("canMarkReplied", () => {
  it("only sent", () => {
    expect(canMarkReplied("sent")).toBe(true);
    const rejected: DraftStatus[] = ["draft", "approved", "failed", "replied", "cancelled", "sending"];
    for (const s of rejected) expect(canMarkReplied(s)).toBe(false);
  });
});

describe("buildFunnel", () => {
  const drafts = (over: Partial<FunnelDraftRow>): FunnelDraftRow => ({
    companyId: 1, step: 1, status: "sent", sentAt: null, replyType: null, ...over,
  });

  it("counts sent+replied both as sent per step; replies by step and type", () => {
    const rows: FunnelDraftRow[] = [
      drafts({ companyId: 1, step: 1, status: "sent" }),
      drafts({ companyId: 2, step: 1, status: "replied", replyType: "interested" }),
      drafts({ companyId: 2, step: 2, status: "sent" }), // pre-reply touch, still counts
      drafts({ companyId: 3, step: 1, status: "replied", replyType: null }),
    ];
    const f = buildFunnel(rows, [], []);
    expect(f.sentByStep[0]).toBe(3); // companies 1,2,3 at step 1
    expect(f.sentByStep[1]).toBe(1); // company 2 at step 2
    expect(f.repliesByStep[0]).toBe(2); // companies 2,3 replied at step 1
    expect(f.repliesByType).toEqual({ interested: 1, unknown: 1 });
  });

  it("companiesContacted/companiesReplied are distinct companies", () => {
    const rows: FunnelDraftRow[] = [
      drafts({ companyId: 1, step: 1, status: "sent" }),
      drafts({ companyId: 1, step: 2, status: "sent" }),
      drafts({ companyId: 2, step: 1, status: "replied", replyType: "no" }),
    ];
    const f = buildFunnel(rows, [], []);
    expect(f.companiesContacted).toBe(2);
    expect(f.companiesReplied).toBe(1);
  });

  it("replyRate is null when nothing sent, else replied/contacted", () => {
    expect(buildFunnel([], [], []).replyRate).toBeNull();
    const rows: FunnelDraftRow[] = [
      drafts({ companyId: 1, step: 1, status: "sent" }),
      drafts({ companyId: 2, step: 1, status: "sent" }),
      drafts({ companyId: 3, step: 1, status: "sent" }),
      drafts({ companyId: 3, status: "replied", step: 1, replyType: "no" }),
      drafts({ companyId: 3, step: 1, status: "replied", replyType: "no" }),
    ];
    const f = buildFunnel(rows, [], []);
    expect(f.companiesContacted).toBe(3);
    expect(f.companiesReplied).toBe(1);
    expect(f.replyRate).toBeCloseTo(1 / 3);
  });

  it("draft/approved/cancelled rows are ignored", () => {
    const rows: FunnelDraftRow[] = [
      drafts({ companyId: 1, step: 1, status: "draft" }),
      drafts({ companyId: 2, step: 1, status: "approved" }),
      drafts({ companyId: 3, step: 1, status: "cancelled" }),
    ];
    const f = buildFunnel(rows, [], []);
    expect(f.companiesContacted).toBe(0);
    expect(f.sentByStep).toEqual([0, 0, 0, 0]);
  });

  it("calls count type call; meetings count meeting/site_visit type or meeting_booked outcome", () => {
    const interactions: FunnelInteractionRow[] = [
      { type: "call", outcome: null },
      { type: "call", outcome: "no_answer" },
      { type: "meeting", outcome: null },
      { type: "site_visit", outcome: null },
      { type: "email", outcome: "meeting_booked" },
    ];
    const f = buildFunnel([], [], interactions);
    expect(f.calls).toBe(2);
    expect(f.meetings).toBe(3);
  });

  it("leadsByTier groups null as none; won counts outcome won", () => {
    const leads: FunnelLeadRow[] = [
      { tier: "A", outcome: "open" },
      { tier: "B", outcome: "won" },
      { tier: null, outcome: "open" },
      { tier: null, outcome: "won" },
    ];
    const f = buildFunnel([], leads, []);
    expect(f.leadsByTier).toEqual({ A: 1, B: 1, none: 2 });
    expect(f.won).toBe(2);
  });

  it("targets are true/false at the exact thresholds", () => {
    // replyRate exactly 0.25 -> true
    const rows: FunnelDraftRow[] = [
      drafts({ companyId: 1, step: 1, status: "sent" }),
      drafts({ companyId: 2, step: 1, status: "sent" }),
      drafts({ companyId: 3, step: 1, status: "sent" }),
      drafts({ companyId: 4, step: 1, status: "replied", replyType: "no" }),
    ];
    expect(buildFunnel(rows, [], []).targets.replyRate).toBe(true);

    const calls3: FunnelInteractionRow[] = [
      { type: "call", outcome: null }, { type: "call", outcome: null }, { type: "call", outcome: null },
    ];
    expect(buildFunnel([], [], calls3).targets.calls).toBe(false);
    const calls4: FunnelInteractionRow[] = [...calls3, { type: "call", outcome: null }];
    expect(buildFunnel([], [], calls4).targets.calls).toBe(true);

    const oneB: FunnelLeadRow[] = [{ tier: "B", outcome: "open" }];
    expect(buildFunnel([], oneB, []).targets.tierAB).toBe(true);
    expect(buildFunnel([], [], []).targets.tierAB).toBe(false);
  });
});
