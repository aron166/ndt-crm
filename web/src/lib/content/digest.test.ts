import { describe, it, expect, vi, beforeEach } from "vitest";

const tenantFindUnique = vi.fn();
const userFindFirst = vi.fn();
const contentItemFindMany = vi.fn();
const contentCheckCount = vi.fn();
const executeRaw = vi.fn();
vi.mock("@/lib/db", () => ({
  db: {
    tenant: { findUnique: (...a: unknown[]) => tenantFindUnique(...a) },
    user: { findFirst: (...a: unknown[]) => userFindFirst(...a) },
    contentItem: { findMany: (...a: unknown[]) => contentItemFindMany(...a) },
    contentCheck: { count: (...a: unknown[]) => contentCheckCount(...a) },
    $executeRaw: (...a: unknown[]) => executeRaw(...a),
  },
}));

const getContentReviewers = vi.fn();
vi.mock("./reviewers", () => ({ getContentReviewers: (...a: unknown[]) => getContentReviewers(...a) }));

const sendEmail = vi.fn();
vi.mock("@/lib/integrations/resend", () => ({ sendEmail: (...a: unknown[]) => sendEmail(...a) }));

const reportError = vi.fn();
vi.mock("@/lib/report-error", () => ({ reportError: (...a: unknown[]) => reportError(...a) }));

import { STALE_REVIEW_MS } from "./types";
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

  it("lists each item with its waited days, oldest wording intact (no emoji, plain text email)", () => {
    const fourDays = new Date(NOW.getTime() - 4 * 24 * 60 * 60 * 1000);
    const threeDays = new Date(NOW.getTime() - 3 * 24 * 60 * 60 * 1000);
    const d = buildDigest({
      reviewerId: 1, reviewerName: "Nagy Péter", now: NOW, baseUrl: BASE,
      items: [
        { id: 1, title: "Régi", category: "email", waitingSince: fourDays },
        { id: 2, title: "Friss", category: "email", waitingSince: threeDays },
      ],
    })!;
    // Over the stale threshold the row says so in words, not with a glyph.
    expect(d.text).toMatch(/Régi \(E-mail\), 4 napja vár, régóta\. .*\/marketing\/1/);
    expect(d.text).toMatch(/Friss \(E-mail\), 3 napja vár\. .*\/marketing\/2/);
    expect(d.text).not.toMatch(/⚠/);
  });

  it("the stale callout follows STALE_REVIEW_MS exactly", () => {
    const justOver = new Date(NOW.getTime() - STALE_REVIEW_MS - 60_000);
    const justUnder = new Date(NOW.getTime() - STALE_REVIEW_MS + 60_000);
    const over = buildDigest({ reviewerId: 1, reviewerName: "Áron", now: NOW, baseUrl: BASE,
      items: [{ id: 1, title: "Régi", category: "email", waitingSince: justOver }] })!;
    const under = buildDigest({ reviewerId: 1, reviewerName: "Áron", now: NOW, baseUrl: BASE,
      items: [{ id: 2, title: "Friss", category: "email", waitingSince: justUnder }] })!;
    expect(over.text).toMatch(/régóta/);
    expect(under.text).not.toMatch(/régóta/);
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

  it("still returns null with zero items and zero (or no) open decisions", () => {
    expect(buildDigest({ reviewerId: 1, reviewerName: "Áron", items: [], now: NOW, baseUrl: BASE, openDecisions: 0 })).toBeNull();
    expect(buildDigest({ reviewerId: 1, reviewerName: "Áron", items: [], now: NOW, baseUrl: BASE })).toBeNull();
  });

  it("a reviewer with items AND open decisions gets both in the email", () => {
    const d = buildDigest({
      reviewerId: 1, reviewerName: "Áron", now: NOW, baseUrl: BASE, openDecisions: 3,
      items: [{ id: 1, title: "A", category: "email", waitingSince: NOW }],
    })!;
    expect(d.subject).toBe("1 anyag vár Önre");
    expect(d.text).toContain("3 megválaszolatlan kérdés vár Önre.");
    expect(d.text).toContain(`${BASE}/marketing/decisions`);
  });

  it("a reviewer with zero items but open decisions still gets an email", () => {
    const d = buildDigest({ reviewerId: 1, reviewerName: "Áron", items: [], now: NOW, baseUrl: BASE, openDecisions: 2 })!;
    expect(d).not.toBeNull();
    expect(d.subject).toBe("2 megválaszolatlan kérdés vár Önre");
    expect(d.text).toContain("2 megválaszolatlan kérdés vár Önre.");
  });
});

describe("isDigestTime", () => {
  it("Monday 06:00Z is 08:00 Budapest in summer (CEST, UTC+2) — true", () => {
    expect(isDigestTime(new Date("2026-06-01T06:00:00Z"))).toBe(true); // Monday
  });

  it("Monday 06:00Z is 07:00 Budapest in winter (CET) — still inside the window", () => {
    expect(isDigestTime(new Date("2026-01-05T06:00:00Z"))).toBe(true); // Monday
    expect(isDigestTime(new Date("2026-01-05T07:00:00Z"))).toBe(true); // 08:00 Budapest
  });
  it("outside 07:00-08:59 Budapest — false", () => {
    expect(isDigestTime(new Date("2026-06-01T04:00:00Z"))).toBe(false); // 06:00 Budapest
    expect(isDigestTime(new Date("2026-06-01T07:00:00Z"))).toBe(false); // 09:00 Budapest
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
    contentCheckCount.mockReset();
    getContentReviewers.mockReset();
    sendEmail.mockReset();
    reportError.mockReset();
    executeRaw.mockReset();
    tenantFindUnique.mockResolvedValue({ settings: {} });
    executeRaw.mockResolvedValue(1); // claim succeeds by default
    contentCheckCount.mockResolvedValue(0);
  });

  const DIGEST_TIME = new Date("2026-06-01T06:00:00Z"); // Monday 08:00 Budapest

  it("sends nothing when it isn't digest time, without forcing", async () => {
    getContentReviewers.mockResolvedValue([1, 2]);
    const res = await sendContentDigests(1, new Date("2026-06-01T03:00:00Z"));
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

  it("a second call the same day finds the day already claimed — already_sent, no email sent", async () => {
    getContentReviewers.mockResolvedValue([1]);
    executeRaw.mockResolvedValue(0); // someone already claimed today
    const res = await sendContentDigests(1, DIGEST_TIME);
    expect(res).toEqual({ sent: 0, skipped: 0, reason: "already_sent" });
    expect(sendEmail).not.toHaveBeenCalled();
    expect(userFindFirst).not.toHaveBeenCalled();
  });

  it("force bypasses the claim, even if today is already marked sent", async () => {
    getContentReviewers.mockResolvedValue([1]);
    userFindFirst.mockResolvedValue({ name: "Áron", email: "aron@example.com" });
    contentItemFindMany.mockResolvedValue([
      { id: 1, title: "X", category: "email", currentVersion: { createdAt: DIGEST_TIME } },
    ]);
    sendEmail.mockResolvedValue({ ok: true, id: "abc" });
    executeRaw.mockResolvedValue(0); // would report already claimed if consulted
    const res = await sendContentDigests(1, DIGEST_TIME, { force: true });
    expect(res.sent).toBe(1);
    expect(executeRaw).not.toHaveBeenCalled();
  });

  it("a reviewer with items and open decisions gets one email covering both", async () => {
    getContentReviewers.mockResolvedValue([1]);
    userFindFirst.mockResolvedValue({ name: "Áron", email: "aron@example.com" });
    contentItemFindMany.mockResolvedValue([
      { id: 1, title: "X", category: "email", currentVersion: { createdAt: DIGEST_TIME } },
    ]);
    contentCheckCount.mockResolvedValue(4);
    sendEmail.mockResolvedValue({ ok: true, id: "abc" });
    const res = await sendContentDigests(1, DIGEST_TIME);
    expect(res.sent).toBe(1);
    expect(sendEmail.mock.calls[0][0].text).toContain("4 megválaszolatlan kérdés vár Önre.");
  });

  it("a reviewer with only open decisions (no items) still gets an email", async () => {
    getContentReviewers.mockResolvedValue([1]);
    userFindFirst.mockResolvedValue({ name: "Áron", email: "aron@example.com" });
    contentItemFindMany.mockResolvedValue([]);
    contentCheckCount.mockResolvedValue(1);
    sendEmail.mockResolvedValue({ ok: true, id: "abc" });
    const res = await sendContentDigests(1, DIGEST_TIME);
    expect(res.sent).toBe(1);
    expect(sendEmail.mock.calls[0][0].subject).toBe("1 megválaszolatlan kérdés vár Önre");
  });

  it("a reviewer with neither items nor open decisions gets nothing", async () => {
    getContentReviewers.mockResolvedValue([1]);
    userFindFirst.mockResolvedValue({ name: "Áron", email: "aron@example.com" });
    contentItemFindMany.mockResolvedValue([]);
    contentCheckCount.mockResolvedValue(0);
    const res = await sendContentDigests(1, DIGEST_TIME);
    expect(res).toEqual({ sent: 0, skipped: 1 });
    expect(sendEmail).not.toHaveBeenCalled();
  });
});
