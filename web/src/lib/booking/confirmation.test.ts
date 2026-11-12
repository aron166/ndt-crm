import { describe, it, expect, vi, beforeEach } from "vitest";

const { db, sendEmail } = vi.hoisted(() => ({
  db: { tenant: { findUnique: vi.fn() }, task: { findFirst: vi.fn() } },
  sendEmail: vi.fn(),
}));
vi.mock("@/lib/db", () => ({ db }));
vi.mock("@/lib/integrations/resend", () => ({ sendEmail }));

import { buildIcs, buildConfirmation, sendBookingConfirmation } from "./confirmation";

const ev = (startsAt: string, minutes: number) => ({
  uid: "booking-task-50@helm-crm", startsAt: new Date(startsAt), minutes, summary: "Demó: Teszt Kft", location: "Debrecen", description: "x",
  organizer: { name: "Nagy Péter", email: "peter@example.test" }, now: new Date("2026-11-20T09:00:00Z"),
});
const line = (ics: string, prefix: string) => ics.split("\r\n").find((l) => l.startsWith(prefix + ";TZID") || (prefix !== "DTSTART" && l.startsWith(prefix)));

describe("buildIcs: Europe/Budapest wall time and daylight saving", () => {
  it("winter (CET): 10:00 local is written as 10:00 with the TZID", () => {
    const ics = buildIcs(ev("2026-11-26T09:00:00Z", 90));
    expect(line(ics, "DTSTART")).toBe("DTSTART;TZID=Europe/Budapest:20261126T100000");
    expect(line(ics, "DTEND")).toBe("DTEND;TZID=Europe/Budapest:20261126T113000");
  });
  it("summer (CEST): 10:00 local is 08:00Z", () => {
    expect(line(buildIcs(ev("2027-06-10T08:00:00Z", 60)), "DTSTART")).toBe("DTSTART;TZID=Europe/Budapest:20270610T100000");
  });
  it("across the spring change (28 Mar 2027): 01:30 CET plus 2 h real time ends 04:30 CEST", () => {
    const ics = buildIcs(ev("2027-03-28T00:30:00Z", 120));
    expect(line(ics, "DTSTART")).toBe("DTSTART;TZID=Europe/Budapest:20270328T013000");
    expect(line(ics, "DTEND")).toBe("DTEND;TZID=Europe/Budapest:20270328T043000");
  });
  it("across the autumn change (25 Oct 2026): 02:30 CEST plus 2 h ends 03:30 CET", () => {
    const ics = buildIcs(ev("2026-10-24T23:30:00Z", 120)); // 01:30 CEST... then 03:30Z
    expect(line(ics, "DTSTART")).toBe("DTSTART;TZID=Europe/Budapest:20261025T013000");
    expect(line(ics, "DTEND")).toBe("DTEND;TZID=Europe/Budapest:20261025T023000");
    const over = buildIcs(ev("2026-10-25T00:30:00Z", 120)); // 02:30 CEST, +2 h real = 03:30 CET
    expect(line(over, "DTSTART")).toBe("DTSTART;TZID=Europe/Budapest:20261025T023000");
    expect(line(over, "DTEND")).toBe("DTEND;TZID=Europe/Budapest:20261025T033000");
  });
  it("carries a VTIMEZONE with both yearly rules, CRLF lines, UTC stamp, escaped text, folded long lines", () => {
    const ics = buildIcs({ ...ev("2026-11-26T09:00:00Z", 90), description: "a, b; c\nd " + "x".repeat(200) });
    expect(ics.startsWith("BEGIN:VCALENDAR\r\n")).toBe(true);
    expect(ics.endsWith("END:VCALENDAR\r\n")).toBe(true);
    expect(ics).toContain("TZID:Europe/Budapest");
    expect(ics).toContain("RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU");
    expect(ics).toContain("RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU");
    expect(ics).toContain("DTSTAMP:20261120T090000Z");
    expect(ics).toContain("DESCRIPTION:a\\, b\\; c\\nd ");
    expect(ics).toContain("METHOD:PUBLISH");
    expect(ics.split("\r\n").every((l) => Buffer.byteLength(l) <= 75)).toBe(true);
  });
});

const task = {
  id: 50, startsAt: new Date("2026-11-26T09:00:00Z"), estimatedMinutes: 90, bookingKind: "single_machine_demo",
  siteAddress: "Fő utca 1.", siteSettlement: { name: "Debrecen" },
  company: { name: "Teszt Kft" },
  person: { firstName: "Anna", lastName: "Kovács", email: "anna@teszt.example.test", phone: "+36 30 111 2222" },
  lead: { contact: { email: null } },
  assignedTo: { name: "Nagy Péter", email: "peter@example.test" },
};

describe("buildIcs: text escaping and parameter quoting", () => {
  it("a company named 'A; B' has its semicolon backslash-escaped in SUMMARY and the booking mail", () => {
    const ics = buildIcs({ ...ev("2026-11-26T09:00:00Z", 60), summary: "Demó: A; B, C" });
    expect(ics).toContain("SUMMARY:Demó: A\\; B\\, C");
    expect(ics).not.toContain("SUMMARY:Demó: A; B");
  });
  it("a backslash is doubled", () => {
    expect(buildIcs({ ...ev("2026-11-26T09:00:00Z", 60), location: "a\\b" })).toContain("LOCATION:a\\\\b");
  });
  it("ORGANIZER CN is quoted when the name has a comma, colon or semicolon; inner quotes dropped; plain names stay bare", () => {
    expect(buildIcs({ ...ev("2026-11-26T09:00:00Z", 60), organizer: { name: "Nagy, Péter: \"X\"; Y", email: "p@e.test" } }))
      .toContain('ORGANIZER;CN="Nagy, Péter: X; Y":mailto:p@e.test');
    expect(buildIcs(ev("2026-11-26T09:00:00Z", 60))).toContain("ORGANIZER;CN=Nagy Péter:mailto:peter@example.test");
  });
});

describe("buildConfirmation", () => {
  it("names the Budapest time, place and host; says it is automatic; no banned words", () => {
    const c = buildConfirmation({ ...task, now: new Date("2026-11-20T09:00:00Z") });
    expect(c.customer.subject).toContain("2026-11-26");
    expect(c.customer.text).toContain("Tisztelt Kovács Anna!");
    expect(c.customer.text).toContain("10:00");
    expect(c.customer.text).toContain("Debrecen, Fő utca 1.");
    expect(c.customer.text).toContain("Nagy Péter");
    expect(c.customer.text).toMatch(/automatikus/);
    for (const w of ["garancia", "engedély", "röntgen", "Ft", "—", "–"]) expect(c.customer.text + c.host.text).not.toContain(w);
    expect(c.host.text).toContain("Teszt Kft");
    // the company name with a semicolon reaches the .ics escaped
    expect(buildConfirmation({ ...task, company: { name: "A; B" }, now: new Date() }).ics).toContain("SUMMARY:Demó: A\\; B");
    expect(c.host.text).toContain("+36 30 111 2222");
  });
});

describe("sendBookingConfirmation", () => {
  beforeEach(() => {
    for (const t of Object.values(db)) for (const f of Object.values(t)) f.mockReset();
    sendEmail.mockReset().mockResolvedValue({ ok: true });
    db.task.findFirst.mockResolvedValue(task);
  });
  it("tenant setting absent or false: nothing is read, nothing is sent", async () => {
    db.tenant.findUnique.mockResolvedValue({ settings: null });
    expect(await sendBookingConfirmation(1, 50)).toEqual({ sent: 0, skipped: "off" });
    db.tenant.findUnique.mockResolvedValue({ settings: { bookingConfirmationEmail: false } });
    expect((await sendBookingConfirmation(1, 50)).sent).toBe(0);
    expect(db.task.findFirst).not.toHaveBeenCalled();
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("on: the customer and the host each get the invite as an .ics attachment; tenant scoped", async () => {
    db.tenant.findUnique.mockResolvedValue({ settings: { bookingConfirmationEmail: true } });
    expect(await sendBookingConfirmation(1, 50)).toEqual({ sent: 2 });
    expect(db.task.findFirst.mock.calls[0][0].where).toMatchObject({ id: 50, tenantId: 1 });
    const [a, b] = sendEmail.mock.calls.map((c) => c[0]);
    expect(a).toMatchObject({ tenantId: 1, to: "anna@teszt.example.test", replyTo: "peter@example.test" });
    expect(b).toMatchObject({ tenantId: 1, to: "peter@example.test", skipLog: true });
    for (const m of [a, b]) {
      expect(m.attachments).toHaveLength(1);
      expect(m.attachments[0].filename).toBe("demo.ics");
      expect(Buffer.from(m.attachments[0].content, "base64").toString()).toContain("DTSTART;TZID=Europe/Budapest:20261126T100000");
    }
  });
  it("no customer address: only the host is told; no host address: only the customer; neither: nothing", async () => {
    db.tenant.findUnique.mockResolvedValue({ settings: { bookingConfirmationEmail: true } });
    db.task.findFirst.mockResolvedValue({ ...task, person: { ...task.person, email: null } });
    expect((await sendBookingConfirmation(1, 50)).sent).toBe(1);
    sendEmail.mockClear();
    db.task.findFirst.mockResolvedValue({ ...task, assignedTo: { name: "X", email: "rendszer@system" } });
    expect((await sendBookingConfirmation(1, 50)).sent).toBe(1);
    db.task.findFirst.mockResolvedValue({ ...task, person: null, assignedTo: null });
    sendEmail.mockClear();
    expect((await sendBookingConfirmation(1, 50)).sent).toBe(0);
    expect(sendEmail).not.toHaveBeenCalled();
  });
  it("a failing send never throws; a task that is not a booking is skipped", async () => {
    db.tenant.findUnique.mockResolvedValue({ settings: { bookingConfirmationEmail: true } });
    sendEmail.mockResolvedValue({ ok: false, error: "x" });
    expect(await sendBookingConfirmation(1, 50)).toMatchObject({ sent: 0, errors: 2 });
    db.task.findFirst.mockResolvedValue({ ...task, startsAt: null });
    expect(await sendBookingConfirmation(1, 50)).toMatchObject({ sent: 0, skipped: "no_booking" });
  });
});
