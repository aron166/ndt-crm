import "server-only";
import { db } from "@/lib/db";
import { audit } from "@/lib/audit";
import { reportError } from "@/lib/report-error";

// The intro material (termékismertető) hand-off, triggered by `send_intro: true`
// on POST /api/leads. The qualification model trades the answers FOR this PDF,
// so it has to leave the building the moment the form is submitted.
//
// Two paths, one promise: the lead always gets it, or a human is told to send it.
//   • Resend connected + an email address → send it now, logged as an outbound
//     interaction (lib/integrations/resend.ts does the logging).
//   • Otherwise → a task, so it cannot be silently dropped.
// Never throws: intake must not fail because an email did.

export const INTRO_TASK_TITLE = "Küldd el a termékismertetőt";
/** Shown in the email when Áron hasn't put the real URL in the settings yet. */
export const INTRO_URL_PLACEHOLDER = "[TERMÉKISMERTETŐ LINK — Beállítások]";

/** tenants.settings.introMaterialUrl — where the PDF lives. */
export async function getIntroMaterialUrl(tenantId: number): Promise<string | null> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const url = (tenant?.settings as { introMaterialUrl?: unknown } | null)?.introMaterialUrl;
  return typeof url === "string" && url.trim() ? url.trim() : null;
}

function introEmail(url: string) {
  return {
    subject: "BetonScan 3D — termékismertető",
    text: [
      "Kedves Érdeklődő!",
      "",
      "Köszönjük az érdeklődést. A termékismertetőt itt éred el:",
      url,
      "",
      "Ha van konkrét feladat, hívjuk és egyeztetünk a részletekről.",
      "",
      "Üdvözlettel,",
      "BetonScan 3D",
    ].join("\n"),
  };
}

export type IntroResult = "email" | "task" | "skipped";

/**
 * Deliver the intro material. Returns what actually happened, so the API can
 * report it back to the landing page.
 */
export async function sendIntroMaterial(args: {
  tenantId: number;
  leadId: number;
  to: string | null | undefined;
  companyId: number | null;
  personId: number | null;
  companyName?: string | null;
}): Promise<IntroResult> {
  const { tenantId, leadId, to, companyId, personId } = args;
  try {
    const url = (await getIntroMaterialUrl(tenantId)) ?? INTRO_URL_PLACEHOLDER;

    if (to) {
      const { isConnected, sendEmail } = await import("@/lib/integrations/resend");
      if (await isConnected()) {
        const { subject, text } = introEmail(url);
        const res = await sendEmail({ to, subject, text, companyId, personId });
        if (res.ok) return "email";
        reportError("leads.intro.send", new Error(res.error), { leadId });
      }
    }

    // No Resend, no address, or the send failed → a human owes them the PDF.
    const due = new Date();
    due.setDate(due.getDate() + 1);
    const task = await db.task.create({
      data: {
        tenantId,
        leadId,
        companyId,
        personId,
        title: INTRO_TASK_TITLE,
        description: to
          ? `A lead kérte a termékismertetőt. Küldd el ide: ${to}\nLink: ${url}`
          : `A lead kérte a termékismertetőt, de nincs email címe. Hívd fel.\nLink: ${url}`,
        type: "email",
        category: "revenue_generating",
        dueDate: due,
      },
      select: { id: true },
    });
    audit("task", task.id, "create", null,
      { title: INTRO_TASK_TITLE, leadId, reason: to ? "resend_unavailable" : "no_email" },
      { tenantId, actor: "system" });
    return "task";
  } catch (err) {
    reportError("leads.intro", err, { leadId });
    return "skipped";
  }
}
