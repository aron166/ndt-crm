"use server";

import { resolveDraftRecipient } from "@/lib/outreach/recipient";
import { db } from "@/lib/db";
import { revalidatePath } from "next/cache";
import { audit } from "@/lib/audit";
import { getActor, NOT_A_CRM_USER } from "@/lib/actor";
import { isSuppressed, parseSuppressionTarget } from "@/lib/suppression";

const TENANT_ID = 1;
const CHANNELS = ["email", "phone", "linkedin", "in_person"];

// Same gate as tasks.ts: message only, each action builds its own literal.
async function requireUser(): Promise<{ denied: string | null; userId: number | null }> {
  const { userId } = await getActor(TENANT_ID);
  return { denied: userId == null ? NOT_A_CRM_USER : null, userId };
}

// Add-only by spec: there is deliberately no edit or delete action.
export async function addSuppression(formData: FormData) {
  const { denied, userId } = await requireUser();
  if (denied) return { error: denied };

  const target = ((formData.get("target") as string) || "").trim();
  const parsed = parseSuppressionTarget(target);
  if (!parsed) return { error: "Érvénytelen email cím." };
  const email = "email" in parsed ? parsed.email : null;
  const domain = "domain" in parsed ? parsed.domain : null;

  const requestedRaw = ((formData.get("requestedAt") as string) || "").trim();
  const requestedAt = new Date(`${requestedRaw}T00:00:00.000Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(requestedRaw) || Number.isNaN(requestedAt.getTime())) {
    return { error: "Add meg a kérés dátumát." };
  }
  if (requestedRaw > new Date().toISOString().slice(0, 10)) {
    return { error: "A kérés dátuma nem lehet a jövőben." };
  }

  const channelRaw = ((formData.get("channel") as string) || "").trim();
  if (channelRaw && !CHANNELS.includes(channelRaw)) return { error: "Érvénytelen csatorna." };
  const channel = channelRaw || null;

  const source = ((formData.get("source") as string) || "").trim() || null;
  if (source && source.length > 200) return { error: "A forrás legfeljebb 200 karakter lehet." };
  const note = ((formData.get("note") as string) || "").trim() || null;
  if (note && note.length > 1000) return { error: "A megjegyzés legfeljebb 1000 karakter lehet." };

  let row;
  try {
    row = await db.suppression.create({
      data: { tenantId: TENANT_ID, email, domain, requestedAt, channel, source, note, createdById: userId },
    });
  } catch (e) {
    if ((e as { code?: string }).code === "P2002") return { error: "Ez a cím vagy domain már tiltólistán van." };
    throw e;
  }

  await audit("suppression", row.id, "create", null, { email, domain, requestedAt, channel, source });

  // Queued drafts to the new entry must not go out: cancel them now.
  const queued = await db.emailDraft.findMany({
    where: { tenantId: TENANT_ID, status: { in: ["draft", "approved", "failed"] } },
    select: { id: true, status: true, toEmail: true, personId: true, companyId: true },
  });
  const set = { emails: new Set(email ? [email] : []), domains: new Set(domain ? [domain] : []) };
  let cancelled = 0;
  for (const d of queued) {
    // ponytail: one lookup per row; batch when the queue is hundreds
    if (!isSuppressed(await resolveDraftRecipient(TENANT_ID, d), set)) continue;
    const res = await db.emailDraft.updateMany({
      where: { id: d.id, tenantId: TENANT_ID, status: d.status },
      data: { status: "cancelled" },
    });
    if (res.count === 0) continue;
    cancelled += 1;
    await audit("email_draft", d.id, "update", { status: d.status }, { status: "cancelled", reason: "suppressed" });
  }

  revalidatePath("/settings/suppressions");
  return { success: true as const, cancelled };
}
