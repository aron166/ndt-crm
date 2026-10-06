// Time-to-first-contact and the tier-A "call within 1 hour" flag. Pure: no db.

/** interaction.type values that count as contact with the lead ("note" does not). */
export const FIRST_CONTACT_TYPES = ["call", "email", "meeting", "site_visit", "field_visit"];

export const TIER_A_CALL_WINDOW_MIN = 60;

export function minutesToFirstContact(leadCreatedAt: Date, firstContactAt: Date | null): number | null {
  if (!firstContactAt) return null;
  return Math.max(0, Math.floor((firstContactAt.getTime() - leadCreatedAt.getTime()) / 60000));
}

export function tierAFlag(
  tier: string | null,
  createdAt: Date,
  firstContactAt: Date | null,
  now: Date,
): "due" | "overdue" | null {
  if (tier !== "A" || firstContactAt) return null;
  return (now.getTime() - createdAt.getTime()) / 60000 > TIER_A_CALL_WINDOW_MIN ? "overdue" : "due";
}

/** 42 -> "42 p", 185 -> "3 ó 5 p", 2 days 4 h -> "2 n 4 ó". Two largest units, zeros dropped. */
export function formatMinutes(m: number): string {
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  const parts: [number, string][] = d > 0 ? [[d, "n"], [h, "ó"]] : h > 0 ? [[h, "ó"], [min, "p"]] : [[min, "p"]];
  return parts.filter(([n], i) => n > 0 || i === 0).map(([n, u]) => `${n} ${u}`).join(" ");
}
