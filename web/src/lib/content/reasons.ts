/**
 * Why a reviewer sent something back (Áron, 2026-09-17). A send-back verdict
 * ("changes" / "rewrite") must carry ONE of these tags plus the free-text
 * comment. The tag is the structured part: it is what later lets us learn which
 * verdict Áron would give, so it has to be queryable, not buried in prose.
 *
 * PURE module: the UI renders the labels, the service validates the key, and
 * GET /api/content/queue passes the key to the content-revise skill.
 */

export const REVIEW_REASONS = [
  "wording",        // a megfogalmazás
  "translated",     // fordításízű
  "fact_wrong",     // téves tény
  "claim_not_allowed", // nem engedélyezett állítás
  "wrong_contact",  // nem a jó címzett
  "too_long",       // túl hosszú
  "wrong_ask",      // nem jó a kérdés/kérés
  "wrong_format",   // nem jó a forma
  "other",          // más (a megjegyzés kötelező)
] as const;
export type ReviewReason = (typeof REVIEW_REASONS)[number];

export function isReviewReason(v: unknown): v is ReviewReason {
  return typeof v === "string" && (REVIEW_REASONS as readonly string[]).includes(v);
}

/** ⚠️ HU PROPOSALS — Áron has not signed these off. */
export const REVIEW_REASON_LABEL: Record<ReviewReason, string> = {
  wording: "A megfogalmazás",
  translated: "Fordításízű",
  fact_wrong: "Téves tény",
  claim_not_allowed: "Nem engedélyezett állítás",
  wrong_contact: "Nem a jó címzett",
  too_long: "Túl hosszú",
  wrong_ask: "Nem jó a kérdés vagy a kérés",
  wrong_format: "Nem jó a forma",
  other: "Más",
};

/** A verdict that sends the item back needs a reason tag. */
export function reasonRequiredFor(verdict: string): boolean {
  return verdict === "changes" || verdict === "rewrite";
}
