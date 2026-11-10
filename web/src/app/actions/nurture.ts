"use server";

import { revalidatePath } from "next/cache";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { userLeadCtx } from "@/lib/actor";
import { demoHostsFromSettings } from "@/lib/booking/queries";

// Nurture template sign-off. Only Áron signs (W9: "each template needs Áron's
// signature once, then the CRM sends it automatically"): the signed-in CRM user
// must be the tenant's demoHosts.aron user.

const TENANT_ID = 1;

async function aronCtx() {
  const ctx = await userLeadCtx(TENANT_ID);
  if ("error" in ctx) return ctx;
  const tenant = await db.tenant.findUnique({ where: { id: TENANT_ID }, select: { settings: true } });
  if (demoHostsFromSettings(tenant?.settings).aron !== ctx.userId) return { error: "Csak Áron hagyhat jóvá hírlevél-sablont" };
  return ctx;
}

export async function approveNurtureTemplateAction(templateId: number, approve: boolean) {
  const ctx = await aronCtx();
  if ("error" in ctx) return ctx;
  if (!Number.isInteger(templateId) || templateId <= 0) return { error: "Érvénytelen sablon" };
  const before = await db.nurtureTemplate.findFirst({ where: { id: templateId, tenantId: TENANT_ID }, select: { status: true, approvedByAron: true } });
  if (!before) return { error: "Sablon nem található" };
  await db.nurtureTemplate.updateMany({
    where: { id: templateId, tenantId: TENANT_ID },
    data: approve
      ? { status: "approved", approvedByAron: true, approvedAt: new Date() }
      : { status: "proposal", approvedByAron: false, approvedAt: null },
  });
  audit("nurture_template", templateId, "update", before, { approvedByAron: approve }, { tenantId: TENANT_ID, actor: "user" });
  revalidatePath("/marketing/nurture");
  return { success: true as const };
}
