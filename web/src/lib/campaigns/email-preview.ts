// The e-mail as one member would get it: PURE (no DB, no Next), so the preview, the launch-tab
// check and the draft writer (service.draftEmailStep) render the same text. Field rules mirror the
// cold-email engine (growth tools/campaign/campaign.py render): greeting from a full name only,
// the why_now opener dropped when no checked fact exists, every other unknown field left visible.
// Hungarian wording here (segment labels, greeting fallback, notes) is PROPOSAL until Áron approves it.

export type SegmentKey = "A" | "B" | "C" | "D" | "E" | "F" | "G";

/** The seven mailed segments of docs/birdsview/launch-2026-11/demo/EMAIL.md (H, private persons, is never mailed). */
export const SEGMENTS: Record<SegmentKey, string> = {
  A: "generálkivitelezők, felújítók",
  B: "statikusok, tervezők",
  C: "tulajdonosok, üzemeltetők, ingatlankezelők",
  D: "gyémántfúrók, betonvágók, gépészek, villanyszerelők",
  E: "ipari üzemek, közművek",
  F: "közszféra: vagyonkezelők, út- és vasútüzemeltetők",
  G: "előregyártók, betongyárak",
};
export const isSegmentKey = (v: unknown): v is SegmentKey => typeof v === "string" && v in SEGMENTS;

// Raw launch-list segment (labs/launch-list build.py) -> mailed segment. Only names whose meaning is
// clear are mapped; anything else stays unknown and the preview says so (PROPOSAL, Mira may re-map).
const RAW_SEGMENT: Record<string, SegmentKey> = {
  contractor: "A", renovation: "A", s3_general_contractor: "A", gc: "A", "gc + precast + rebar": "A", "gc + rail + road": "A", "heritage renovation": "A",
  engineers: "B", s1_design: "B", "bridge design": "B", "engineering and project management": "B",
  facility: "C", s2_asset_operator: "C", "city developer": "C", "state property": "C",
  drillers: "D", s4_cutting_coring: "D", "drilling and cutting": "D", "lift installer": "D",
  industrial: "E", "nuclear waste": "E",
  "motorway asset owner": "F", "rail asset owner": "F", "rail bridges": "F", "city bridges, tunnels": "F", "metro, tunnels, depots": "F", "state investor": "F",
  "ready-mix": "G", "precast halls": "G", "precast utilities": "G",
};
// The builder's lanes that name a segment (SEG_LANE in build.py). Warm network, trip fill, machine
// buyer and founding slot are routes, not segments: they need the raw segment.
const LANE_SEGMENT: Record<string, SegmentKey> = {
  "contractor (eltérés)": "A", engineer: "B", "owner and facility manager": "C", "MEP and drilling": "D",
};

/** The member's mailed segment: its stored raw segment first, then a lane that names one; null = unknown. */
export function segmentOf(m: { segment?: string | null; lane?: string | null }): SegmentKey | null {
  const raw = m.segment?.trim();
  if (raw) {
    if (isSegmentKey(raw)) return raw;
    const hit = RAW_SEGMENT[raw.toLowerCase()];
    if (hit) return hit;
  }
  return (m.lane && LANE_SEGMENT[m.lane]) || null;
}

/** Full name known (two words or more): "Tisztelt <name>!", else the engine's neutral opener. Never a guessed úr or asszony. */
export function greetingFor(fullName: string | null | undefined): string {
  const parts = (fullName ?? "").split(/\s+/).filter((p) => p && p !== "-");
  return parts.length >= 2 ? `Tisztelt ${parts.join(" ")}!` : "Jó napot kívánok!";
}

export interface MergeValues {
  company: string | null;
  contactName: string | null;
  city: string | null;
  segment: SegmentKey | null;
  senderName: string | null;
  senderPhone: string | null;
  /** A checked, sourced fact about the recipient. The list builder's internal reason is NOT one. */
  whyNow: string | null;
  tripDate: string | null;
  tripCity: string | null;
}

export type Part = { t: string } | { missing: string };
export interface Rendered {
  subject: Part[];
  body: Part[];
  /** Unresolved field names, once each, in order of first use. */
  missing: string[];
  /** What the render did on purpose (a dropped opener). */
  notes: string[];
  /** Fields glued to a suffix in the template ({{city}}-ban): the template must be rewritten. */
  suffix: string[];
}

export const OPENER = "Azért írok Önnek, mert {{why_now}}.";
const FIELD = /\{\{\s*([A-Za-z_]+)\s*\}\}/g;
// A field followed straight by a letter or a hyphen and a letter: a Hungarian suffix glued on.
const GLUED = /\{\{\s*([A-Za-z_]+)\s*\}\}(?=-?\p{L})/gu;
const NO_SUFFIX_FIELDS = new Set(["company", "city", "trip_city", "contact_name"]);

function value(field: string, v: MergeValues): string | null {
  switch (field) {
    case "greeting": return greetingFor(v.contactName);
    case "company": return v.company;
    case "contact_name": return v.contactName;
    case "city": return v.city;
    case "segment": return v.segment ? SEGMENTS[v.segment] : null;
    case "sender_name": return v.senderName;
    case "sender_phone": return v.senderPhone;
    case "why_now": return v.whyNow;
    case "trip_date": return v.tripDate;
    case "trip_city": return v.tripCity;
    default: return null; // an unknown field is never guessed
  }
}

function fill(text: string, v: MergeValues, missing: string[]): Part[] {
  const out: Part[] = [];
  let at = 0;
  for (const m of text.matchAll(FIELD)) {
    if (m.index > at) out.push({ t: text.slice(at, m.index) });
    const val = value(m[1], v)?.trim();
    if (val) out.push({ t: val });
    else {
      out.push({ missing: m[1] });
      if (!missing.includes(m[1])) missing.push(m[1]);
    }
    at = m.index + m[0].length;
  }
  if (at < text.length) out.push({ t: text.slice(at) });
  // Adjacent text parts joined, so a test and a draft read whole strings.
  return out.reduce<Part[]>((acc, p) => {
    const last = acc[acc.length - 1];
    if ("t" in p && last && "t" in last) acc[acc.length - 1] = { t: last.t + p.t };
    else acc.push(p);
    return acc;
  }, []);
}

export function renderEmail(tpl: { subject: string; body: string }, v: MergeValues): Rendered {
  const notes: string[] = [];
  const suffix = [...new Set([...`${tpl.subject}\n${tpl.body}`.matchAll(GLUED)].map((m) => m[1]).filter((f) => NO_SUFFIX_FIELDS.has(f)))];
  let body = tpl.body;
  if (!v.whyNow?.trim() && body.includes(OPENER)) {
    body = body.replace(" " + OPENER, "").replace(OPENER, "");
    notes.push("A „Azért írok Önnek, mert ...” mondat kimaradt: nincs ellenőrzött, forrásolt tény erről a cégről.");
  }
  const missing: string[] = [];
  return { subject: fill(tpl.subject, v, missing), body: fill(body, v, missing), missing, notes, suffix };
}

/** Plain text of a fully resolved render; null while any field is unresolved (a draft is never written then). */
export function renderedText(parts: readonly Part[]): string | null {
  return parts.every((p) => "t" in p) ? parts.map((p) => (p as { t: string }).t).join("") : null;
}

export interface StepVariant { itemId: number; segment: SegmentKey; status: string }

/**
 * The asset one member gets on an e-mail step: the variant tagged for its segment, else the step's
 * own asset. `liveOnly` (drafting) ignores anything not live. Two variants for one segment: the live
 * one, then the lowest id.
 */
export function pickAsset(
  step: { contentItemId: number | null; contentStatus?: string | null },
  variants: readonly StepVariant[],
  segment: SegmentKey | null,
  liveOnly = false,
): number | null {
  const ok = (status: string | null | undefined) => !liveOnly || status === "live";
  const mine = variants.filter((x) => x.segment === segment && ok(x.status))
    .sort((a, b) => Number(b.status === "live") - Number(a.status === "live") || a.itemId - b.itemId);
  if (mine.length) return mine[0].itemId;
  return step.contentItemId != null && ok(step.contentStatus) ? step.contentItemId : null;
}

/** Variant tag on a content item's source_meta: { campaignStep: <position>, segment: "A".."G" }. */
export function variantTag(meta: unknown): { step: number; segment: SegmentKey } | null {
  if (!meta || typeof meta !== "object") return null;
  const m = meta as Record<string, unknown>;
  return Number.isInteger(m.campaignStep) && isSegmentKey(m.segment) ? { step: m.campaignStep as number, segment: m.segment } : null;
}
