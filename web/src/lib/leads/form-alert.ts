import "server-only";
import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { getResendConfig, sendEmail } from "@/lib/integrations/resend";
import { demoHostsFromSettings } from "@/lib/booking/queries";

// raw60: every new web-form lead emails SALES (Péter + Áron, the tenant's
// demoHosts users) with the answers. INTERNAL ONLY: recipients are CRM users,
// never the lead. A no-op without Resend credentials. Never throws.

const BASE = process.env.APP_BASE_URL ?? "https://ndt-crm.vercel.app";

/** Pure: the alert text. */
export function formAlertText(lead: {
  id: number; company: string | null; contactName: string | null; email: string | null; phone: string | null;
  intent: string | null; callWindow: string | null; message: string | null; answers: Record<string, unknown>; tier: string | null;
}, base = BASE): { subject: string; text: string } {
  const answers = Object.entries(lead.answers).filter(([, v]) => v != null && v !== "")
    .map(([k, v]) => `- ${k}: ${String(v)}`);
  return {
    subject: `Új űrlapos lead: ${lead.contactName ?? lead.company ?? `#${lead.id}`}${lead.tier ? ` (${lead.tier})` : ""}`,
    text: [
      `Új lead érkezett az űrlapról (#${lead.id}).`,
      "",
      `Név: ${lead.contactName ?? "-"}`,
      `Cég: ${lead.company ?? "-"}`,
      `Telefon: ${lead.phone ?? "-"}`,
      `E-mail: ${lead.email ?? "-"}`,
      `Szándék: ${lead.intent ?? "-"}`,
      `Hívható: ${lead.callWindow ?? "-"}`,
      "",
      "Válaszok:",
      ...(answers.length ? answers : ["- (nincs)"]),
      ...(lead.message ? ["", "Üzenet:", lead.message] : []),
      "",
      `Megnyitás: ${base}/leads/${lead.id}`,
    ].join("\n"),
  };
}

export async function sendFormAlert(tenantId: number, leadId: number): Promise<{ sent: number }> {
  try {
    if (!(await getResendConfig(tenantId))) return { sent: 0 };
    const [tenant, lead] = await Promise.all([
      db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } }),
      db.lead.findFirst({
        where: { id: leadId, tenantId },
        select: {
          id: true, intent: true, message: true, qualification: true, customFields: true, tier: true,
          company: { select: { name: true } },
          contact: { select: { email: true, phone: true, person: { select: { firstName: true, lastName: true } } } },
        },
      }),
    ]);
    if (!lead) return { sent: 0 };
    const hostIds = Object.values(demoHostsFromSettings(tenant?.settings)).filter((x): x is number => typeof x === "number");
    const users = hostIds.length
      ? await db.user.findMany({ where: { tenantId, id: { in: hostIds } }, select: { email: true } })
      : [];
    const cf = (lead.customFields ?? {}) as Record<string, unknown>;
    const q = (lead.qualification ?? {}) as Record<string, unknown>;
    const s = (v: unknown) => (typeof v === "string" && v.trim() ? v.trim() : null);
    const p = lead.contact?.person;
    const { subject, text } = formAlertText({
      id: lead.id, company: lead.company?.name ?? null,
      contactName: s(cf.contact_name) ?? (p ? `${p.lastName} ${p.firstName}`.trim() : null),
      email: s(cf.contact_email) ?? lead.contact?.email ?? null,
      phone: s(cf.contact_phone) ?? lead.contact?.phone ?? null,
      intent: lead.intent ?? s(q.intent) ?? s(q.gate),
      callWindow: s(q.call_window) ?? s(cf.call_window),
      message: lead.message, answers: q, tier: lead.tier,
    });
    let sent = 0;
    for (const u of users) {
      const r = await sendEmail({ tenantId, to: u.email, subject, text, skipLog: true });
      if (r.ok) sent++; else reportError("leads.formAlert.send", new Error(r.error), { leadId });
    }
    return { sent };
  } catch (err) {
    reportError("leads.formAlert", err, { leadId });
    return { sent: 0 };
  }
}
