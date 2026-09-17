import { describe, it, expect, vi, beforeEach } from "vitest";

const tenantFindUnique = vi.fn();
const userFindFirst = vi.fn();
const contentItemFindMany = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    contentItem: { findMany: (...a: unknown[]) => contentItemFindMany(...a) },
  },
}));

const getContentReviewers = vi.fn();
vi.mock("./reviewers", () => ({ getContentReviewers: (...a: unknown[]) => getContentReviewers(...a) }));

const sendEmail = vi.fn();
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const reportError = vi.fn();
vi.mock("@/lib/report-error", () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { buildDigest, isDigestTime, sendContentDigests } from "./digest";

const BASE = "https://ndt-crm.vercel.app";
const NOW = new Date("2026-09-17T08:00:00Z");

describe("buildDigest", () => {
  it("returns null when there are no items", () => {
    expect(buildDigest({ reviewerId: 1, reviewerName: "Nagy Péter", items: [], now: NOW, baseUrl: BASE })).toBeNull();
  });

  it("sorts oldest first regardless of input order", () => {
    const older = new Date("2026-09-10T08:00:00Z");
    const newer = new Date("2026-09-16T08:00:00Z");
    const d = buildDigest({
      reviewerId: 1, reviewerName: "Nagy Péter", now: NOW, baseUrl: BASE,
      items: [
        { id: 2, title: "Újabb", category: "email", waitingSince: newer },
        { id: 1, title: "Régebbi", category: "script", waitingSince: older },
      ],
    })!;
    expect(d.text.indexOf("Régebbi")).toBeLessThan(d.text.indexOf("Újabb"));
  });

  it("marks items waiting more than 3 days with ⚠️, and not items waiting 3 or fewer", () => {
    const fourDays = new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000);
    const threeDays = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
    const d = buildDigest({
      reviewerId: 1, reviewerName: "Nagy Péter", now: NOW, baseUrl: BASE,
      items: [
        { id: 1, title: "Régi", category: "email", waitingSince: fourDays },
        { id: 2, title: "Friss", category: "email", waitingSince: threeDays },
      ],
    })!;
    expect(d.text).toMatch(/Régi \(E-mail\) — 4 napja vár ⚠️ — .*\/marketing\/1/);
    expect(d.text).toMatch(/Friss \(E-mail\) — 3 napja vár — .*\/marketing\/2/);
  });

  it("subject counts the items", () => {
    const d = buildDigest({
      reviewerId: 1, reviewerName: "Nagy Péter", now: NOW, baseUrl: BASE,
      items: [
        { id: 1, title: "A", category: "email", waitingSince: NOW },
        { id: 2, title: "B", category: "email", waitingSince: NOW },
      ],
    })!;
    expect(d.subject).toBe("2 anyag vár Önre");
  });

  it("greets with the first name under the last-name-first convention; a single token is used as-is", () => {
    const item = { id: 1, title: "A", category: "email", waitingSince: NOW };
    expect(buildDigest({ reviewerId: 1, reviewerName: "Nagy Péter", items: [item], now: NOW, baseUrl: BASE })!.text)
      .toMatch(/^Kedves Péter!/);
    expect(buildDigest({ reviewerId: 1, reviewerName: "Áron", items: [item], now: NOW, baseUrl: BASE })!.text)
      .toMatch(/^Kedves Áron!/);
  });

  it("links to the item and to /marketing", () => {
    const d = buildDigest({
      reviewerId: 1, reviewerName: "Áron", now: NOW, baseUrl: BASE,
      items: [{ id: 9, title: "A", category: "email", waitingSince: NOW }],
    })!;
    expect(d.text).toContain(`${BASE}/marketing/9`);
    expect(d.text).toContain(`${BASE}/marketing`);
  });
});

describe("isDigestTime", () => {
  it("Monday 06:00Z is 08:00 Budapest in summer (CEST, UTC+2) — true", () => {
    expect(isDigestTime(new Date("2026-06-01T06:00:00Z"))).toBe(true); // Monday
  });

  it("Monday 06:00Z is 07:00 Budapest in winter (CET, UTC+1) — false; 07:00Z is 08:00 — true", () => {
    expect(isDigestTime(new Date("2026-01-05T06:00:00Z"))).toBe(false); // Monday
    expect(isDigestTime(new Date("2026-01-05T07:00:00Z"))).toBe(true);
  });

  it("Saturday at 08:00 Budapest is false", () => {
    expect(isDigestTime(new Date("2026-06-06T06:00:00Z"))).toBe(false); // Saturday
  });
});

describe("sendContentDigests", () => {
  beforeEach(() => {
    tenantFindUnique.mockReset();
    userFindFirst.mockReset();
    contentItemFindMany.mockReset();
    getContentReviewers.mockReset();
    sendEmail.mockReset();
    reportError.mockReset();
    tenantFindUnique.mockResolvedValue({ settings: {} });
  });

  const DIGEST_TIME = new Date("2026-06-01T06:00:00Z"); // Monday 08:00 Budapest

  it("sends nothing when it isn't digest time, without forcing", async () => {
    getContentReviewers.mockResolvedValue([1, 2]);
    const res = await sendContentDigests(1, new Date("2026-06-01T05:00:00Z"));
    expect(res).toEqual({ sent: 0, skipped: 0, reason: "not_digest_time" });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("respects opt-out — an opted-out reviewer gets nothing", async () => {
    getContentReviewers.mockResolvedValue([1, 2]);
    tenantFindUnique.mockResolvedValue({ settings: { contentDigestOptOut: [1] } });
    userFindFirst.mockResolvedValue({ name: "Áron", email: "aron@example.com" });
    contentItemFindMany.mockResolvedValue([
      { id: 1, title: "X", category: "email", currentVersion: { createdAt: DIGEST_TIME } },
    ]);
    sendEmail.mockResolvedValue({ ok: true, id: "abc" });
    const res = await sendContentDigests(1, DIGEST_TIME);
    expect(sendEmail).toHaveBeenCalledTimes(1); // only reviewer 2
    expect(res.sent).toBe(1);
    expect(res.skipped).toBe(1);
  });

  it("nobody pending → skipped, not sent", async () => {
    getContentReviewers.mockResolvedValue([1]);
    userFindFirst.mockResolvedValue({ name: "Áron", email: "aron@example.com" });
    contentItemFindMany.mockResolvedValue([]);
    const res = await sendContentDigests(1, DIGEST_TIME);
    expect(res).toEqual({ sent: 0, skipped: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
  });

  it("one reviewer failing (throws) does not stop the other from getting their digest", async () => {
    getContentReviewers.mockResolvedValue([1, 2]);
    userFindFirst.mockImplementation(async ({ where }: { where: { id: number } }) => {
      if (where.id === 1) throw new Error("db blew up");
      return { name: "Péter", email: "peter@example.com" };
    });
    contentItemFindMany.mockResolvedValue([
      { id: 5, title: "Y", category: "script", currentVersion: { createdAt: DIGEST_TIME } },
    ]);
    sendEmail.mockResolvedValue({ ok: true, id: "abc" });
    const res = await sendContentDigests(1, DIGEST_TIME);
    expect(res.sent).toBe(1);
    expect(res.skipped).toBe(1);
    expect(reportError).toHaveBeenCalled();
  });

  it("force sends outside digest hours", async () => {
    getContentReviewers.mockResolvedValue([1]);
    userFindFirst.mockResolvedValue({ name: "Áron", email: "aron@example.com" });
    contentItemFindMany.mockResolvedValue([
      { id: 1, title: "X", category: "email", currentVersion: { createdAt: new Date() } },
    ]);
    sendEmail.mockResolvedValue({ ok: true, id: "abc" });
    const res = await sendContentDigests(1, new Date("2026-06-01T05:00:00Z"), { force: true });
    expect(res.sent).toBe(1);
  });
});
