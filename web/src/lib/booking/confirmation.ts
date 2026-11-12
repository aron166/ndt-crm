// Booking confirmation: when a demo slot is booked, the customer and the host get an e-mail with an
// .ics invite. OFF unless tenants.settings.bookingConfirmationEmail === true (nothing sets it; flip it
// by hand). Hungarian text here is PROPOSAL until Áron approves it. Automatic text: it says so.
import { db } from "@/lib/db";
import { sendEmail } from "@/lib/integrations/resend";
import { BOOKING_TZ, localDay, localMinuteOfDay } from "./time";
import { BOOKING_KIND_LABEL, isBookingKind } from "./priority";
import { greetingFor } from "@/lib/campaigns/email-preview";

export const BOOKING_CONFIRM_KEY = "bookingConfirmationEmail";

// ── .ics (RFC 5545), PURE ───────────────────────────────────────────────────

export interface IcsEvent {
  uid: string; startsAt: Date; minutes: number; summary: string; location?: string | null; description?: string | null;
  organizer?: { name: string; email: string } | null; now: Date;
}

const pad = (n: number, w = 2) => String(n).padStart(2, "0");
/** Local Budapest wall time as YYYYMMDDTHHMMSS; the TZID and the VTIMEZONE rules do the daylight saving. */
function wall(d: Date): string {
  const l = localDay(d), m = localMinuteOfDay(d);
  return `${l.y}${pad(l.m)}${pad(l.d)}T${pad(Math.floor(m / 60))}${pad(m % 60)}00`;
}
const utc = (d: Date) => d.toISOString().replace(/[-:]/g, "").replace(/\.\d{3}/, "");
const esc = (t: string) => t.replace(/\\/g, "\\\\").replace(/;/g, "\\;").replace(/,/g, "\\,").replace(/\r?\n/g, "\\n");
/** A parameter value (CN=): quoted when it holds , ; or :, double quotes dropped (RFC 5545 3.2). */
const param = (v: string) => { const t = v.replace(/"/g, "").replace(/[\r\n]+/g, " "); return /[,;:]/.test(t) ? `"${t}"` : t; };

/** Fold at 75 octets (RFC 5545 3.1), never inside a UTF-8 character; continuation lines start with a space. */
function fold(l: string): string[] {
  const out: string[] = [];
  let cur = "", bytes = 0;
  for (const ch of l) {
    const b = Buffer.byteLength(ch);
    if (bytes + b > (out.length ? 74 : 75)) { out.push(cur); cur = ""; bytes = 0; }
    cur += ch; bytes += b;
  }
  out.push(cur);
  return out.map((x, i) => (i ? " " + x : x));
}

const VTIMEZONE = [
  "BEGIN:VTIMEZONE", `TZID:${BOOKING_TZ}`,
  "BEGIN:DAYLIGHT", "TZOFFSETFROM:+0100", "TZOFFSETTO:+0200", "TZNAME:CEST", "DTSTART:19700329T020000", "RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU", "END:DAYLIGHT",
  "BEGIN:STANDARD", "TZOFFSETFROM:+0200", "TZOFFSETTO:+0100", "TZNAME:CET", "DTSTART:19701025T030000", "RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU", "END:STANDARD",
  "END:VTIMEZONE",
];

/** METHOD:PUBLISH: the invite is sent from the CRM's address, not the organizer's, so no RSVP flow is promised. */
export function buildIcs(e: IcsEvent): string {
  const end = new Date(e.startsAt.getTime() + e.minutes * 60_000); // real elapsed time, so a DST change inside the visit is right
  const lines = [
    "BEGIN:VCALENDAR", "VERSION:2.0", "PRODID:-//Helm CRM//Booking//HU", "CALSCALE:GREGORIAN", "METHOD:PUBLISH",
    ...VTIMEZONE,
    "BEGIN:VEVENT", `UID:${e.uid}`, `DTSTAMP:${utc(e.now)}`,
    `DTSTART;TZID=${BOOKING_TZ}:${wall(e.startsAt)}`, `DTEND;TZID=${BOOKING_TZ}:${wall(end)}`,
    `SUMMARY:${esc(e.summary)}`,
    ...(e.location ? [`LOCATION:${esc(e.location)}`] : []),
    ...(e.description ? [`DESCRIPTION:${esc(e.description)}`] : []),
    ...(e.organizer ? [`ORGANIZER;CN=${param(e.organizer.name)}:mailto:${e.organizer.email}`] : []),
    "STATUS:CONFIRMED", "SEQUENCE:0", "END:VEVENT", "END:VCALENDAR",
  ];
  return lines.flatMap(fold).join("\r\n") + "\r\n";
}

// ── The two e-mails, PURE ───────────────────────────────────────────────────

const WEEKDAY = ["vasárnap", "hétfő", "kedd", "szerda", "csütörtök", "péntek", "szombat"];

export interface ConfirmTask {
  id: number; startsAt: Date; estimatedMinutes: number | null; bookingKind: string | null; siteAddress: string | null;
  siteSettlement: { name: string } | null; company: { name: string } | null;
  person: { firstName: string; lastName: string; email: string | null; phone: string | null } | null;
  lead: { contact: { email: string | null } | null } | null;
  assignedTo: { name: string; email: string } | null;
}

export function buildConfirmation(t: ConfirmTask & { now: Date }) {
  const day = localDay(t.startsAt), m = localMinuteOfDay(t.startsAt);
  const when = `${day.key}, ${WEEKDAY[day.dow]} ${pad(Math.floor(m / 60))}:${pad(m % 60)} (budapesti idő)`;
  const place = [t.siteSettlement?.name, t.siteAddress].filter(Boolean).join(", ") || null;
  const kind = t.bookingKind && isBookingKind(t.bookingKind) ? BOOKING_KIND_LABEL[t.bookingKind] : "Demó";
  const host = t.assignedTo?.name ?? null;
  const company = t.company?.name ?? "ügyfél";
  const ics = buildIcs({
    uid: `booking-task-${t.id}@helm-crm`, startsAt: t.startsAt, minutes: t.estimatedMinutes ?? 90, now: t.now,
    summary: `Demó: ${company}`, location: place, description: `${kind}. Kapcsolattartó: ${host ?? "-"}`,
    organizer: t.assignedTo ? { name: t.assignedTo.name, email: t.assignedTo.email } : null,
  });
  const full = t.person ? `${t.person.lastName} ${t.person.firstName}`.trim() : null; // Hungarian order: family name first
  const customer = {
    subject: `Demó időpont: ${day.key} ${pad(Math.floor(m / 60))}:${pad(m % 60)}`,
    text: [
      greetingFor(full),
      "",
      "Az egyeztetett időpontot foglaltuk le.",
      `Időpont: ${when}`,
      ...(place ? [`Helyszín: ${place}`] : []),
      `Alkalom: ${kind}`,
      ...(host ? [`Kapcsolattartónk: ${host}`] : []),
      "",
      "A mellékelt naptárfájllal felveheti az időpontot a naptárába. Ha az időpont nem megfelelő, válaszoljon erre a levélre.",
      "",
      "Ez automatikus üzenet.",
    ].join("\n"),
  };
  const hostMail = {
    subject: `Új demó időpont: ${company}, ${day.key} ${pad(Math.floor(m / 60))}:${pad(m % 60)}`,
    text: [
      `Foglalás: ${company}`,
      `Időpont: ${when}`,
      ...(place ? [`Helyszín: ${place}`] : []),
      `Alkalom: ${kind}`,
      ...(full ? [`Kapcsolattartó: ${full}${t.person?.phone ? `, ${t.person.phone}` : ""}`] : []),
      "",
      "Ez automatikus üzenet a Helm CRM-ből.",
    ].join("\n"),
  };
  return { customer, host: hostMail, ics, filename: "demo.ics" };
}

// ── Sending ─────────────────────────────────────────────────────────────────

export type ConfirmResult = { sent: number; skipped?: "off" | "no_booking"; errors?: number };

/** Never throws a send failure: the booking is already written. Returns what happened. */
export async function sendBookingConfirmation(tenantId: number, taskId: number): Promise<ConfirmResult> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  if ((tenant?.settings as Record<string, unknown> | null)?.[BOOKING_CONFIRM_KEY] !== true) return { sent: 0, skipped: "off" };

  const t = await db.task.findFirst({
    where: { id: taskId, tenantId, startsAt: { not: null } },
    select: {
      id: true, startsAt: true, estimatedMinutes: true, bookingKind: true, siteAddress: true,
      siteSettlement: { select: { name: true } }, company: { select: { name: true } },
      person: { select: { firstName: true, lastName: true, email: true, phone: true } },
      lead: { select: { contact: { select: { email: true } } } },
      assignedTo: { select: { name: true, email: true } },
    },
  });
  if (!t?.startsAt) return { sent: 0, skipped: "no_booking" };
  const task = { ...t, startsAt: t.startsAt };

  const now = new Date();
  const c = buildConfirmation({ ...task, now });
  const attachments = [{ filename: c.filename, content: Buffer.from(c.ics).toString("base64") }];
  const customerTo = task.person?.email || task.lead?.contact?.email || null;
  const hostTo = task.assignedTo && !task.assignedTo.email.endsWith("@system") ? task.assignedTo.email : null;

  let sent = 0, errors = 0;
  const go = async (p: Parameters<typeof sendEmail>[0]) => {
    const r = await sendEmail(p).catch(() => ({ ok: false as const }));
    if (r.ok) sent++; else errors++;
  };
  if (customerTo) await go({ tenantId, to: customerTo, subject: c.customer.subject, text: c.customer.text, replyTo: hostTo, attachments });
  if (hostTo) await go({ tenantId, to: hostTo, subject: c.host.subject, text: c.host.text, skipLog: true, attachments });
  return errors ? { sent, errors } : { sent };
}
