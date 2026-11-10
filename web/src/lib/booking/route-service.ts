import { z } from "zod";
import { db } from "@/lib/db";
import { audit, type AuditOptions } from "@/lib/audit";
import { answersFrom } from "@/lib/leads/qualification";
import { isBookingKind, type BookingKind } from "./priority";
import { bookingConfigFromSettings, visitMinutes, type BookingConfig } from "./config";
import { checkPlacement } from "./feasibility";
import { nearbyBookings } from "./bundles";
import { bestOnDay, proposeRouteSlots, type RouteSlotsInput } from "./route-slots";
import { addDays, addWorkingDays, atLocal, localDay } from "./time";
import { straightLineSource, type DriveTimeSource, type Place } from "./travel";
import { resolveDemoHost } from "./queries";
import type { BundleHint, Flag, Machine, PlacementResult, RankedSlot, RouteStop } from "./route-types";

/**
 * W8b route-aware booking: the DB side. Every query here is tenant-scoped; the
 * math is the pure modules next door. The /api/booking routes are thin
 * wrappers over these functions and do the auth check first.
 */

/** Slice 1 drive source. Slice 2 (N4) swaps in the OSRM matrix with the band as fallback. */
const drive: DriveTimeSource = straightLineSource;

export const SITE_SOURCES = ["stated", "permit", "tender", "premises", "company_address_assumed"] as const;
export type SiteSource = (typeof SITE_SOURCES)[number];

export interface SettlementOut extends Place {
  name: string;
  county: string;
  district: number | null;
  postcodes: string[];
}

const settlementSelect = { id: true, name: true, county: true, district: true, lat: true, lng: true, postcodes: true } as const;

// ── Settlements (reference data, not tenant-owned) ─────────────────────────

export async function searchSettlements(q: string, limit = 15): Promise<SettlementOut[]> {
  const term = q.trim();
  if (/^\d{4}$/.test(term)) {
    return db.huSettlement.findMany({ where: { postcodes: { has: term } }, select: settlementSelect, take: limit });
  }
  if (term.length < 2) return [];
  return db.huSettlement.findMany({
    where: { name: { startsWith: term, mode: "insensitive" } },
    select: settlementSelect,
    orderBy: [{ name: "asc" }, { district: "asc" }],
    take: limit,
  });
}

export async function getSettlement(id: number): Promise<SettlementOut | null> {
  return db.huSettlement.findUnique({ where: { id }, select: settlementSelect });
}

// ── Machines and config ────────────────────────────────────────────────────

export interface MachineOut extends Machine {
  base: SettlementOut;
}

/** Bookable equipment of this tenant that has a base. Ordered by id: the first one also carries pre-W8b bookings. */
export async function loadMachines(tenantId: number): Promise<MachineOut[]> {
  const rows = await db.equipment.findMany({
    where: { tenantId, bookable: true, baseSettlementId: { not: null } },
    select: { id: true, name: true, baseSettlement: { select: settlementSelect } },
    orderBy: { id: "asc" },
  });
  return rows.flatMap((r) => (r.baseSettlement ? [{ id: r.id, name: r.name, base: r.baseSettlement }] : []));
}

export async function loadBookingConfig(tenantId: number): Promise<BookingConfig> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return bookingConfigFromSettings(tenant?.settings);
}

// ── Timeline ───────────────────────────────────────────────────────────────

/**
 * Every open on-site booking of the tenant in [from, to), on every machine,
 * whoever is assigned. A pre-W8b booking (booking_kind set, no machine) sits on
 * the first machine: there was one machine when it was made.
 */
export async function loadRouteStops(
  tenantId: number,
  machines: Machine[],
  cfg: BookingConfig,
  from: Date,
  to: Date,
): Promise<RouteStop[]> {
  if (machines.length === 0) return [];
  const rows = await db.task.findMany({
    where: {
      tenantId,
      startsAt: { gte: from, lt: to },
      status: { notIn: ["done", "cancelled"] },
      OR: [{ equipmentId: { not: null } }, { bookingKind: { not: null } }],
    },
    select: {
      id: true, title: true, startsAt: true, estimatedMinutes: true, bookingKind: true, equipmentId: true, leadId: true,
      siteSettlement: { select: { id: true, name: true, lat: true, lng: true } },
    },
  });
  return rows
    .filter((r): r is typeof r & { startsAt: Date } => r.startsAt !== null)
    .map((r) => ({
      id: r.id,
      machineId: r.equipmentId ?? machines[0].id,
      startsAt: r.startsAt,
      minutes: r.estimatedMinutes && r.estimatedMinutes > 0 ? r.estimatedMinutes : visitMinutes(cfg, r.bookingKind),
      place: r.siteSettlement,
      title: r.title,
      kind: r.bookingKind,
      leadId: r.leadId,
    }));
}

// ── Lead site prefill ──────────────────────────────────────────────────────

export interface LeadSite {
  settlement: SettlementOut | null;
  address: string | null;
  source: SiteSource | null;
}

/**
 * Where a lead's job probably is, before anybody asks: the postcode the lead
 * gave (stated), else the company's operating or registered address (assumed,
 * the UI must ask to confirm it on the call). Null when nothing matches.
 */
export async function leadSite(tenantId: number, leadId: number): Promise<LeadSite | null> {
  const lead = await db.lead.findFirst({
    where: { id: leadId, tenantId },
    select: {
      qualification: true,
      company: { select: { zipCode: true, city: true, address: true, siteZip: true, siteCity: true, siteStreet: true } },
    },
  });
  if (!lead) return null;
  const postcode = answersFrom(lead.qualification).postcode?.match(/\b\d{4}\b/)?.[0];
  if (postcode) {
    const [s] = await searchSettlements(postcode, 1);
    if (s) return { settlement: s, address: null, source: "stated" };
  }
  const c = lead.company;
  for (const [zip, city, street] of [[c?.siteZip, c?.siteCity, c?.siteStreet], [c?.zipCode, c?.city, c?.address]]) {
    const s = await settlementFor(zip, city);
    if (s) return { settlement: s, address: street ?? null, source: "company_address_assumed" };
  }
  return { settlement: null, address: null, source: null };
}

async function settlementFor(zip?: string | null, city?: string | null): Promise<SettlementOut | null> {
  const pc = zip?.match(/\b\d{4}\b/)?.[0];
  if (pc) {
    const [s] = await searchSettlements(pc, 1);
    if (s) return s;
  }
  const name = city?.trim();
  if (!name) return null;
  // Only an unambiguous exact name: two villages share many names, Budapest has 23 districts.
  const hits = await db.huSettlement.findMany({ where: { name: { equals: name, mode: "insensitive" } }, select: settlementSelect, take: 2 });
  return hits.length === 1 ? hits[0] : null;
}

// ── Slots and checks ───────────────────────────────────────────────────────

export const routeQuerySchema = z.object({
  settlementId: z.number().int().positive().nullable(),
  kind: z.string().refine(isBookingKind, "Ismeretlen foglalástípus").nullable().optional(),
  minutes: z.number().int().min(15).max(600).optional(),
  /** Only this machine; omitted = any free machine. */
  machineId: z.number().int().positive().optional(),
  /** Moving an existing booking: leave it out of the timeline. */
  excludeTaskId: z.number().int().positive().optional(),
  /** "Site from the company address": every result carries site_assumed. */
  siteSource: z.enum(SITE_SOURCES).optional(),
});

export const slotsQuerySchema = routeQuerySchema.extend({
  /** The day the customer wants (ISO date or instant); default = earliest allowed. */
  wanted: z.coerce.date().optional(),
  urgent: z.boolean().optional(),
  days: z.number().int().min(1).max(60).optional(),
  count: z.number().int().min(1).max(20).optional(),
});

export const checkQuerySchema = routeQuerySchema.extend({ startsAt: z.coerce.date() });

interface Prepared {
  cfg: BookingConfig;
  machines: MachineOut[];
  place: SettlementOut | null;
  kind: BookingKind | null;
  minutes: number;
}

type Fail = { error: string; status: number };

async function prepare(tenantId: number, q: z.infer<typeof routeQuerySchema>): Promise<Prepared | Fail> {
  const [cfg, allMachines, place] = await Promise.all([
    loadBookingConfig(tenantId),
    loadMachines(tenantId),
    q.settlementId != null ? getSettlement(q.settlementId) : Promise.resolve(null),
  ]);
  if (q.settlementId != null && !place) return { error: "Ismeretlen település", status: 400 };
  if (allMachines.length === 0) return { error: "Nincs foglalható gép beállítva", status: 409 };
  const machines = q.machineId != null ? allMachines.filter((m) => m.id === q.machineId) : allMachines;
  if (machines.length === 0) return { error: "Ismeretlen gép", status: 400 };
  const kind = (q.kind ?? null) as BookingKind | null;
  return { cfg, machines, place, kind, minutes: q.minutes ?? visitMinutes(cfg, kind) };
}

/** Start of tomorrow, Budapest: no same-day bookings (as the existing proposer). */
function tomorrow(now: Date): Date {
  return atLocal(addDays(localDay(now), 1), 0);
}

function timelineWindow(cfg: BookingConfig, from: Date, days: number): [Date, Date] {
  // Bundles look bundleWindowWorkingDays either side; two calendar days per working day is a safe cover.
  const pad = cfg.bundleWindowWorkingDays * 2 + 2;
  return [atLocal(addDays(localDay(from), -pad), 0), atLocal(addDays(localDay(from), days + pad), 0)];
}

function withSiteFlag<T extends { flags: Flag[] }>(r: T, assumed: boolean): T {
  return assumed ? { ...r, flags: [...r.flags, { code: "site_assumed", severity: "warn" }] } : r;
}

export interface SlotsResult {
  site: SettlementOut | null;
  kind: BookingKind | null;
  minutes: number;
  from: Date;
  machines: MachineOut[];
  slots: RankedSlot[];
}

/** Ranked, feasible-only proposals: the user never sees a slot the machine cannot make. */
export async function proposeSlotsFor(
  tenantId: number,
  q: z.infer<typeof slotsQuerySchema>,
  now = new Date(),
): Promise<SlotsResult | Fail> {
  const p = await prepare(tenantId, q);
  if ("error" in p) return p;
  const notBefore = tomorrow(now);
  const lead = p.kind ? p.cfg.minLeadWorkingDaysByKind[p.kind] ?? 0 : 0;
  const leadDay = atLocal(addWorkingDays(localDay(now), lead), 0);
  const from = leadDay > notBefore ? leadDay : notBefore;
  const days = q.days ?? 21;
  const [winFrom, winTo] = timelineWindow(p.cfg, from, days);
  const stops = await loadRouteStops(tenantId, p.machines, p.cfg, winFrom, winTo);
  const slots = proposeRouteSlots({
    place: p.place, minutes: p.minutes, machines: p.machines, stops, from, days, count: q.count ?? 3,
    cfg: p.cfg, drive, wanted: q.wanted, urgent: q.urgent, excludeId: q.excludeTaskId, notBefore,
  });
  const assumed = q.siteSource === "company_address_assumed";
  return { site: p.place, kind: p.kind, minutes: p.minutes, from, machines: p.machines, slots: slots.map((s) => withSiteFlag(s, assumed)) };
}

export interface CheckResult {
  site: SettlementOut | null;
  kind: BookingKind | null;
  minutes: number;
  startsAt: Date;
  /** True when at least one machine can take it. */
  feasible: boolean;
  /** The machine to book: the feasible one that adds the least driving, else null. */
  bestMachineId: number | null;
  /** One result per machine considered, with every factor (legs, day stops, drive, flags). */
  machines: (PlacementResult & { machineName: string })[];
  bundles: BundleHint[];
  /** When nothing fits: the best feasible slots from that day on, so the user is never left with only a "no". */
  alternatives: RankedSlot[];
}

/** A hand-picked time: the same factors as a proposal, never a bare error. */
export async function checkTimeFor(
  tenantId: number,
  q: z.infer<typeof checkQuerySchema>,
  now = new Date(),
): Promise<CheckResult | Fail> {
  const p = await prepare(tenantId, q);
  if ("error" in p) return p;
  const [winFrom, winTo] = timelineWindow(p.cfg, q.startsAt, 7);
  const stops = await loadRouteStops(tenantId, p.machines, p.cfg, winFrom, winTo);
  const assumed = q.siteSource === "company_address_assumed";
  const results = p.machines.map((m) => ({
    ...withSiteFlag(
      checkPlacement({ id: q.excludeTaskId, machineId: m.id, startsAt: q.startsAt, minutes: p.minutes, place: p.place }, stops, m, p.cfg, drive),
      assumed,
    ),
    machineName: m.name,
  }));
  const feasibleOnes = results.filter((r) => r.feasible).sort((a, b) => a.addedDriveMinutes - b.addedDriveMinutes);
  const notBefore = tomorrow(now);
  const slotInput: RouteSlotsInput = {
    place: p.place, minutes: p.minutes, machines: p.machines, stops, from: notBefore, days: 1, count: 1,
    cfg: p.cfg, drive, excludeId: q.excludeTaskId, notBefore,
  };
  const bundles = nearbyBookings({
    place: p.place, startsAt: q.startsAt, stops, cfg: p.cfg, drive, excludeId: q.excludeTaskId,
    suggest: (d) => {
      const dayStart = atLocal(d, 0);
      const b = bestOnDay(d, { ...slotInput, from: dayStart > notBefore ? dayStart : notBefore });
      return b && { startsAt: b.startsAt, machineId: b.machineId };
    },
  });
  let alternatives: RankedSlot[] = [];
  if (feasibleOnes.length === 0) {
    const dayStart = atLocal(localDay(q.startsAt), 0);
    const altFrom = dayStart > notBefore ? dayStart : notBefore;
    const [aFrom, aTo] = timelineWindow(p.cfg, altFrom, 10);
    const altStops = aFrom >= winFrom && aTo <= winTo ? stops : await loadRouteStops(tenantId, p.machines, p.cfg, aFrom, aTo);
    alternatives = proposeRouteSlots({ ...slotInput, stops: altStops, from: altFrom, days: 10, count: 3 }).map((s) => withSiteFlag(s, assumed));
  }
  return {
    site: p.place, kind: p.kind, minutes: p.minutes, startsAt: q.startsAt,
    feasible: feasibleOnes.length > 0,
    bestMachineId: feasibleOnes[0]?.machineId ?? null,
    machines: results, bundles, alternatives,
  };
}

// ── Create a booking ───────────────────────────────────────────────────────

export const createBookingSchema = z.object({
  leadId: z.number().int().positive(),
  settlementId: z.number().int().positive(),
  siteAddress: z.string().trim().max(500).optional(),
  siteSource: z.enum(SITE_SOURCES),
  startsAt: z.coerce.date(),
  kind: z.string().refine(isBookingKind, "Ismeretlen foglalástípus"),
  minutes: z.number().int().min(15).max(600).optional(),
  machineId: z.number().int().positive().optional(),
  demoWith: z.enum(["aron", "peter"]).optional(),
  /** Required when the time fails the route check on the chosen machine (Áron 2026-11-10 decision 1). */
  overrideReason: z.string().trim().min(5).max(500).optional(),
});

export interface BookingCtx {
  tenantId: number;
  userId: number;
}

export type CreateBookingResult =
  | { success: true; taskId: number; machineId: number; overridden: boolean; check: CheckResult }
  | { error: string; status: number; check?: CheckResult };

/**
 * Write one booking task with its site and machine. The route check runs again
 * here, on the write: a time the chosen machine cannot make is refused unless
 * the caller typed an override reason, which is stored on the task.
 */
export async function createBooking(ctx: BookingCtx, raw: unknown, auditOpts: AuditOptions = {}): Promise<CreateBookingResult> {
  const parsed = createBookingSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "Érvénytelen adat", status: 400 };
  const input = parsed.data;

  const lead = await db.lead.findFirst({
    where: { id: input.leadId, tenantId: ctx.tenantId },
    select: { id: true, outcome: true, companyId: true, assignedToId: true, contact: { select: { personId: true } }, company: { select: { name: true } } },
  });
  if (!lead) return { error: "Lead nem található", status: 404 };
  if (lead.outcome !== "open") return { error: "A lead lezárt: foglaláshoz előbb nyisd újra", status: 409 };

  let assignedToId = lead.assignedToId ?? ctx.userId;
  if (input.demoWith) {
    const host = await resolveDemoHost(ctx.tenantId, input.demoWith);
    if (host == null) return { error: "Nincs beállítva, ki tartja a demót", status: 409 };
    assignedToId = host;
  }

  const check = await checkTimeFor(ctx.tenantId, {
    settlementId: input.settlementId, startsAt: input.startsAt, kind: input.kind, minutes: input.minutes,
    machineId: input.machineId, siteSource: input.siteSource,
  });
  if ("error" in check) return check;

  const machineId = input.machineId ?? check.bestMachineId ?? check.machines[0].machineId;
  const onMachine = check.machines.find((m) => m.machineId === machineId)!;
  const overridden = !onMachine.feasible;
  if (overridden && !input.overrideReason) {
    return { error: "Ez az időpont nem elérhető a géppel. Válassz a javasolt időpontok közül, vagy add meg az okát.", status: 409, check };
  }

  const who = lead.company?.name ?? `Lead #${lead.id}`;
  const title = `Demó: ${who}`;
  const task = await db.task.create({
    data: {
      tenantId: ctx.tenantId, leadId: lead.id, companyId: lead.companyId, personId: lead.contact?.personId ?? null,
      assignedToId, title, type: "meeting", category: "revenue_generating", status: "created",
      startsAt: input.startsAt, dueDate: input.startsAt, bookingKind: input.kind, estimatedMinutes: check.minutes,
      siteSettlementId: input.settlementId, siteAddress: input.siteAddress || null, siteSource: input.siteSource,
      equipmentId: machineId, overrideReason: overridden ? input.overrideReason! : null,
    },
    select: { id: true },
  });
  audit("task", task.id, "create", null, {
    title, startsAt: input.startsAt.toISOString(), bookingKind: input.kind, leadId: lead.id,
    siteSettlementId: input.settlementId, equipmentId: machineId, overrideReason: overridden ? input.overrideReason : null,
  }, auditOpts);
  return { success: true, taskId: task.id, machineId, overridden, check };
}
