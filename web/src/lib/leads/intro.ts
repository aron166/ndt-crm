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

/**
 * tenants.settings.introMaterialUrl — where the PDF lives, or null.
 *
 * The https check is repeated HERE and not only in the settings writer: this
 * value goes into a customer-facing email, and `tenants.settings` is a JSON blob
 * that any other settings writer (or a manual DB edit) can put anything into.
 * Validating at the single read every caller shares is the only place it holds.
 * (Vanda, #81.)
 */
export async function getIntroMaterialUrl(tenantId: number): Promise<string | null> {
  const tenant = await db.tenant.findUnique({ where: { id: tenantId }, select: { settings: true } });
  const url = (tenant?.settings as { introMaterialUrl?: unknown } | null)?.introMaterialUrl;
  if (typeof url !== "string") return null;
  const trimmed = url.trim();
  return /^https:\/\//i.test(trimmed) ? trimmed : null;
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
}): Promise<IntroResult> {
  const { tenantId, leadId, to, companyId, personId } = args;
  try {
    const url = await getIntroMaterialUrl(tenantId);

    // No link configured → the task branch. Emailing a customer a literal
    // "[TERMÉKISMERTETŐ LINK — Beállítások]" is worse than telling a human to
    // send it. (Vanda, #81.)
    if (to && url) {
      const { isConnected, sendEmail } = await import("@/lib/integrations/resend");
      if (await isConnected(tenantId)) {
        const { subject, text } = introEmail(url);
        const res = await sendEmail({ tenantId, to, subject, text, companyId, personId });
        if (res.ok) return "email";
        reportError("leads.intro.send", new Error(res.error), { leadId });
      }
    }

    // No link, no Resend, no address, or the send failed → a human owes them the PDF.
    const due = new Date();
    due.setDate(due.getDate() + 1);
    const task = await db.task.create({
      data: {
        tenantId,
        leadId,
        companyId,
        personId,
        title: INTRO_TASK_TITLE,
        description: [
          to
            ? `A lead kérte a termékismertetőt. Küldd el ide: ${to}`
            : "A lead kérte a termékismertetőt, de nincs email címe. Hívd fel.",
          url ? `Link: ${url}` : "Nincs termékismertető link beállítva (Leadek → Beállítások).",
        ].join("\n"),
        type: "email",
        category: "revenue_generating",
        dueDate: due,
      },
      select: { id: true },
    });
    audit("task", task.id, "create", null,
      { title: INTRO_TASK_TITLE, leadId, reason: !url ? "no_intro_url" : to ? "resend_unavailable" : "no_email" },
      { tenantId, actor: "system" });
    return "task";
  } catch (err) {
    reportError("leads.intro", err, { leadId });
    return "skipped";
  }
}
