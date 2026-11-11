// A member-load file from the UI: a JSON array (or { rows: [...] }) of either members wire rows
// (docs/api.md "Campaigns") or the launch-list builder's rows (labs/launch-list build.py).
// Builder rows are mapped exactly as web/scripts/load-campaign-members.mjs mapLaunchRow does.
// shortcut: the mapping is duplicated in that script (plain node, cannot import TS); change both.

const clip = (v: unknown, n: number) => (typeof v === "string" && v.trim() ? v.trim().slice(0, n) : undefined);
const str = (v: unknown) => (v == null ? undefined : String(v));

type Raw = Record<string, unknown>;

export function isBuilderRow(r: Raw): boolean {
  return "crm_name" in r || "vat8" in r || "contact_name" in r || "rank" in r;
}

export function mapBuilderRow(r: Raw): Raw {
  const id = Number(r.crm_company_id);
  const email = clip(r.email, 200);
  const rank = Number(r.rank);
  return {
    ...(Number.isInteger(id) && id > 0 ? { crm_company_id: id } : {}),
    company_name: clip(r.crm_name, 200) ?? clip(r.company, 200) ?? "?",
    vat: clip(str(r.vat8), 20),
    city: clip(r.city, 100),
    website: clip(r.website, 300),
    person_name: clip(r.contact_name, 120),
    role: clip(r.contact_role, 120),
    phone: clip(str(r.phone), 40),
    email: email && /^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(email) ? email : undefined,
    tier: clip(r.tier, 2),
    lane: clip(r.lane, 40),
    why: clip(r.why, 300),
    ...(Number.isInteger(rank) && rank >= 0 ? { priority: Math.min(1000, rank) } : {}),
  };
}

/** Parse the file text into wire rows. Builder rows marked crm_lost are left out, like the script's default. */
export function parseMemberFile(text: string): { rows: Raw[] } | { error: string } {
  let raw: unknown;
  try {
    raw = JSON.parse(text);
  } catch {
    return { error: "A fájl nem érvényes JSON" };
  }
  const list = Array.isArray(raw) ? raw : (raw as { rows?: unknown })?.rows;
  if (!Array.isArray(list)) return { error: "A fájlban nincs sorlista (JSON tömb vagy { rows: [...] })" };
  const rows = (list as Raw[])
    .filter((r) => r && typeof r === "object")
    .filter((r) => !r.crm_lost)
    .map((r) => (isBuilderRow(r) ? mapBuilderRow(r) : r));
  if (rows.length === 0) return { error: "A fájl üres" };
  return { rows };
}
