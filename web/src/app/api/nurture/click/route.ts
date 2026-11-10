import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { verifyPayload } from "@/lib/nurture/token";

// Public, token-authenticated click redirect (signed link; on isServiceApiPath).
// Records the click (W3: clicks on the timeline, opens ignored) and, since a click
// is a call trigger (W9 / L4), creates one call task per lead per day. Redirects
// only to our own site; anything else lands on the home page (no open redirect).

type Click = { t: number; en: number; l: number; k: string; p: number; u: string };
const HOME = "https://www.betonradar.hu/";

function safeDestination(u: unknown): string {
  if (typeof u !== "string") return HOME;
  try {
    const url = new URL(u);
    return url.protocol === "https:" && /(^|\.)betonradar\.hu$/i.test(url.hostname) ? url.toString() : HOME;
  } catch {
    return HOME;
  }
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const p = verifyPayload<Click>("click", url.searchParams.get("d"), url.searchParams.get("s"));
  if (!p) return Response.redirect(HOME, 302);
  const dest = safeDestination(p.u);
  try {
    await db.appEvent.create({
      data: { tenantId: p.t, sourceApp: "ndt-crm", eventType: "nurture_click", payload: { leadId: p.l, enrollmentId: p.en, templateKey: p.k, position: p.p, destination: dest } },
    });
    const lead = await db.lead.findFirst({ where: { id: p.l, tenantId: p.t }, select: { id: true, assignedToId: true, companyId: true, contact: { select: { personId: true } } } });
    if (lead) {
      const since = new Date(Date.now() - 86_400_000);
      const title = `Kattintott a hírlevélre (${p.k}): hívd fel`; // PROPOSAL copy
      const open = await db.task.findFirst({ where: { tenantId: p.t, leadId: lead.id, title, createdAt: { gte: since } }, select: { id: true } });
      if (!open) {
        await db.task.create({
          data: {
            tenantId: p.t, leadId: lead.id, companyId: lead.companyId, personId: lead.contact?.personId ?? null,
            assignedToId: lead.assignedToId, title, type: "call", category: "revenue_generating", status: "created",
            dueDate: new Date(Date.now() + 3_600_000),
          },
        });
      }
    }
  } catch (err) {
    // The visitor still gets where they clicked; tracking is best effort.
    reportError("nurture.click", err, { leadId: p.l });
  }
  return Response.redirect(dest, 302);
}
