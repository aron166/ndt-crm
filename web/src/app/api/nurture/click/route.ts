import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { verifyPayload } from "@/lib/nurture/token";

// Public, token-authenticated click redirect (signed link; on isServiceApiPath).
// Records the click (W3: clicks on the timeline, opens ignored). No task on GET:
// mail scanners open every link, so a GET is not proof a person clicked (Vanda W9-1);
// turning clicks into call tasks is a follow-up with a scanner filter. Redirects only
// to our own site; anything else lands on the home page (no open redirect).

type Click = { t: number; en: number; l: number; k: string; p: number; u: string; x?: number };
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
  let p: Click | null = null;
  try { p = verifyPayload<Click>("click", url.searchParams.get("d"), url.searchParams.get("s")); } catch { p = null; }
  if (!p) return Response.redirect(HOME, 302);
  const dest = safeDestination(p.u);
  try {
    await db.appEvent.create({
      data: { tenantId: p.t, sourceApp: "ndt-crm", eventType: "nurture_click", payload: { leadId: p.l, enrollmentId: p.en, templateKey: p.k, position: p.p, destination: dest } },
    });
  } catch (err) {
    // The visitor still gets where they clicked; tracking is best effort.
    reportError("nurture.click", err, { leadId: p.l });
  }
  return Response.redirect(dest, 302);
}
