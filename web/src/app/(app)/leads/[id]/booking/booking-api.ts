import type { BookingKind } from "@/lib/booking/priority";

/** JSON shapes of /api/booking/*: the lib types with every Date as an ISO string. */

export type SiteSource = "stated" | "permit" | "tender" | "premises" | "company_address_assumed";
export type FlagCode = "infeasible" | "machine_clash" | "outside_window" | "day_full" | "tight" | "long_day" | "no_site" | "site_assumed";
export type SlotReason = "same_trip" | "on_the_way" | "earliest" | "free_day" | "next_free";

export interface DriveBandDto { min: number; max: number }
export interface PlaceDto { id: number; lat: number; lng: number; name?: string }
export interface SettlementDto { id: number; name: string; county: string; district: string | null; lat: number; lng: number; postcodes: string[] }
export interface MachineDto { id: number; name: string; base: PlaceDto }
export interface RouteStopDto {
  id: number;
  machineId: number;
  startsAt: string;
  minutes: number;
  place: PlaceDto | null;
  title?: string;
  kind?: string | null;
  leadId?: number | null;
}
export interface FlagDto {
  code: FlagCode;
  severity: "block" | "warn";
  leg?: "before" | "after" | "from_base" | "to_base";
  againstId?: number;
  drive?: DriveBandDto;
  gapMinutes?: number;
  slackMinutes?: number;
  earliestStart?: string;
  latestStart?: string;
}
export interface LegInfoDto { stop: RouteStopDto | null; drive: DriveBandDto | null; gapMinutes: number | null }
export interface PlacementDto {
  machineId: number;
  startsAt: string;
  endsAt: string;
  feasible: boolean;
  flags: FlagDto[];
  before: LegInfoDto;
  after: LegInfoDto;
  dayStops: RouteStopDto[];
  leaveBaseAt: string | null;
  homeAt: string | null;
  dayDriveMinutes: number;
  addedDriveMinutes: number;
}
export interface BundleHintDto {
  stop: RouteStopDto;
  sameDay: boolean;
  driveMinutes: number;
  tier: "same_city" | "near" | "in_area";
  workingDaysApart: number;
  suggestedStart?: string | null;
  suggestedMachineId?: number | null;
}
export interface RankedSlotDto extends PlacementDto {
  cost: number;
  reason: SlotReason;
  bundles: BundleHintDto[];
}
export interface SlotsResultDto {
  site: SettlementDto | null;
  kind: BookingKind;
  minutes: number;
  from: string;
  machines: MachineDto[];
  slots: RankedSlotDto[];
}
export interface CheckResultDto {
  site: SettlementDto | null;
  kind: BookingKind;
  minutes: number;
  startsAt: string;
  feasible: boolean;
  bestMachineId: number | null;
  machines: (PlacementDto & { machineName: string })[];
  bundles: BundleHintDto[];
  alternatives: RankedSlotDto[];
}
export interface LeadSiteDto { settlement: SettlementDto | null; address: string | null; source: "company_address_assumed" | "stated" | null }
export interface BookingCreatedDto { success: true; taskId: number; machineId: number; overridden: boolean; check: CheckResultDto }

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; error: string; check?: CheckResultDto };

export interface SearchBody { settlementId: number; kind: BookingKind; siteSource: SiteSource }
export interface SlotsBody extends SearchBody { count: number; days: number }
export interface CheckBody extends SearchBody { startsAt: string; machineId?: number }
export interface BookingBody extends SearchBody {
  leadId: number;
  startsAt: string;
  machineId?: number;
  siteAddress?: string;
  overrideReason?: string;
}

async function call<T>(url: string, body?: unknown): Promise<ApiResult<T>> {
  try {
    const res = await fetch(url, body === undefined ? undefined : { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    const json = await res.json().catch(() => null);
    if (res.ok) return { ok: true, data: json as T };
    return { ok: false, status: res.status, error: typeof json?.error === "string" ? json.error : `Hiba (${res.status})`, check: json?.check };
  } catch {
    return { ok: false, status: 0, error: "Nincs kapcsolat a szerverrel." }; // PROPOSAL copy
  }
}

export const getLeadSite = (leadId: number) => call<LeadSiteDto>(`/api/booking/leads/${leadId}/site`);
export const getSettlements = (q: string) => call<{ settlements: SettlementDto[] }>(`/api/booking/settlements?q=${encodeURIComponent(q)}`);
export const postSlots = (body: SlotsBody) => call<SlotsResultDto>("/api/booking/slots", body);
export const postCheck = (body: CheckBody) => call<CheckResultDto>("/api/booking/check", body);
export const postBooking = (body: BookingBody) => call<BookingCreatedDto>("/api/booking/bookings", body);
