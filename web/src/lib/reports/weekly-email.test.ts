import { describe, it, expect, vi } from "vitest";

vi.mock("@/lib/db", () => ({ db: {} }));
vi.mock("@/lib/report-error", () => ({ reportError: vi.fn() }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: vi.fn() }));
vi.mock("@/lib/content/reviewers", () => ({ getContentReviewers: vi.fn() }));
vi.mock("@/lib/leads/queries", () => ({ getLeadStatuses: vi.fn() }));
vi.mock("./weekly", () => ({ getWeeklyReport: vi.fn(), previousBudapestWeek: vi.fn() }));

import { buildWeeklyReportEmail, isWeeklyReportTime } from "./weekly-email";
import type { WeeklyReport } from "./weekly";
import type { LeadStatusDef } from "@/lib/leads/statuses";

const statuses: LeadStatusDef[] = [
  { key: "new", label: "Uj lead", color: "#000", position: 0, isInitial: true },
  { key: "call_1", label: "Elso hivas", color: "#000", position: 1, isInitial: false },
] as LeadStatusDef[];

const empty: WeeklyReport = {
  from: new Date("2026-10-04T22:00:00Z"),
  to: new Date("2026-10-11T22:00:00Z"),
  leadsBySourceTier: [],
  leadsTotal: 0,
  tierA: { total: 0, withoutTask: 0, awaitingCall: 0, contacted: 0, medianMinutes: null, p90Minutes: null, leads: [] },
  callOutcomes: [],
  callsTotal: 0,
  demos: { booked: 0, scheduled: 0, held: 0 },
  stageTransitions: [],
  suppression: { added: 0, draftsCancelled: 0 },
  topCompanies: [],
};

const full: WeeklyReport = {
  ...empty,
  leadsBySourceTier: [{ source: "web", tier: "A", count: 5 }, { source: null, tier: null, count: 2 }],
  leadsTotal: 7,
  tierA: { total: 5, withoutTask: 1, awaitingCall: 1, contacted: 3, medianMinutes: 95, p90Minutes: 12, leads: [] },
  callOutcomes: [{ outcome: "meeting_booked", count: 3 }, { outcome: "no_answer", count: 9 }],
  callsTotal: 12,
  demos: { booked: 3, scheduled: 4, held: 2 },
  stageTransitions: [{ from: "new", to: "call_1", count: 6 }],
  suppression: { added: 1, draftsCancelled: 2 },
  topCompanies: [{ companyId: 1, name: "Acme Kft", touches: 8, lastTouchAt: new Date() }],
};

const build = (report: WeeklyReport) =>
  buildWeeklyReportEmail({ report, statuses, recipientName: "Nagy Péter", baseUrl: "https://x.test" });

describe("buildWeeklyReportEmail", () => {
  it("builds subject, labels, outcome and status labels, link", () => {
    const { subject, text } = build(full);
    expect(subject).toBe("Heti riport: 7 lead, 12 hívás, 3 demó");
    expect(text.startsWith("Kedves Péter!")).toBe(true);
    expect(text.split("\n")[1]).toBe("Időszak: 2026-10-05 - 2026-10-11");
    expect(text).toContain("Új leadek: 7");
    expect(text).toContain("Medián: 1 ó 35 p");
    expect(text).toContain("Foglalt meeting: 3");
    expect(text).toContain("Uj lead -> Elso hivas: 6");
    expect(text).toContain("Acme Kft: 8");
    expect(text).toContain("Foglalt demó: 3");
    expect(text.trimEnd().endsWith("A teljes riport: https://x.test/reports/weekly")).toBe(true);
  });

  it("an all-empty week still builds, with empty markers", () => {
    const { subject, text } = build(empty);
    expect(subject).toBe("Heti riport: 0 lead, 0 hívás, 0 demó");
    expect(text).toContain("Nincs adat ebben az időszakban.");
    expect(text).toContain("/reports/weekly");
  });

  it("contains no em or en dash", () => {
    for (const r of [full, empty]) {
      const { subject, text } = build(r);
      expect(subject + text).not.toMatch(/[\u2014\u2013]/);
    }
  });
});

describe("isWeeklyReportTime", () => {
  it("true Monday 07:00 CEST", () => expect(isWeeklyReportTime(new Date("2026-10-12T05:00:00Z"))).toBe(true));
  it("true Monday 06:30 CET", () => expect(isWeeklyReportTime(new Date("2026-11-02T05:30:00Z"))).toBe(true));
  it("false on Tuesday", () => expect(isWeeklyReportTime(new Date("2026-10-13T05:00:00Z"))).toBe(false));
  it("false Monday 11:00", () => expect(isWeeklyReportTime(new Date("2026-10-12T09:00:00Z"))).toBe(false));
});
