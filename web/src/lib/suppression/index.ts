import { db } from "@/lib/db";
import { isSuppressed, type SuppressionSet } from "./match";

export * from "./match";

// ponytail: loads the whole tenant list per call. The list is tens of rows;
// move to a WHERE on (email, domain) when it is thousands.
export async function loadSuppressionSet(tenantId: number): Promise<SuppressionSet> {
  const rows = await db.suppression.findMany({
    where: { tenantId },
    select: { email: true, domain: true },
  });
  const set: SuppressionSet = { emails: new Set(), domains: new Set() };
  for (const r of rows) {
    if (r.email) set.emails.add(r.email);
    if (r.domain) set.domains.add(r.domain);
  }
  return set;
}

export async function isAddressSuppressed(tenantId: number, email: string | null | undefined): Promise<boolean> {
  if (!email) return false;
  return isSuppressed(email, await loadSuppressionSet(tenantId));
}

export const SUPPRESSED_ERROR = "A címzett tiltólistán van, nem küldünk neki.";
