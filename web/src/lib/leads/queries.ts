// Server-only reads for lead statuses. Kept out of statuses.ts so that file
// stays import-safe for client components (it has no db dependency).
import { db } from "@/lib/db";
import { DEFAULT_LEAD_STATUSES, type LeadStatusDef } from "./statuses";
import { questionsFromSettings, type QualificationQuestion } from "./qualification";
import { scriptVariantsFromSettings, type ScriptVariant } from "./scripts";

/**
 * The tenant's lead-pipeline columns, ordered. Falls back to the default set if
 * the tenant has no rows yet (e.g. before the seed ran), so the board never
 * renders empty.
 */
export async function getLeadStatuses(tenantId: number): Promise<LeadStatusDef[]> {
  const rows = await db.leadStatus.findMany({
    where: { tenantId },
    orderBy: { position: "asc" },
  });
  if (rows.length === 0) return DEFAULT_LEAD_STATUSES;
  return rows.map((r) => ({
    key: r.key,
    label: r.label,
    color: r.color,
    position: r.position,
    isInitial: r.isInitial,
    isTerminal: r.isTerminal,
    isCommitment: r.isCommitment,
    description: r.description,
  }));
}

/** Key of the status where inbound leads land; defaults to "new". */
export async function getInitialLeadStatusKey(tenantId: number): Promise<string> {
  const initial = await db.leadStatus.findFirst({
    where: { tenantId, isInitial: true },
    orderBy: { position: "asc" },
  });
  return initial?.key ?? "new";
}

/**
 * The tenant's setter question list. Falls back to the in-code placeholders when
 * the tenant has never set one (or set a malformed one).
 */
export async function getQualificationQuestions(tenantId: number): Promise<QualificationQuestion[]> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return questionsFromSettings(tenant?.settings);
}

/**
 * The tenant's call-script A/B variants. Falls back to the in-code placeholders
 * when the tenant has never set one (or set a malformed one).
 */
export async function getScriptVariants(tenantId: number): Promise<ScriptVariant[]> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  return scriptVariantsFromSettings(tenant?.settings);
}
