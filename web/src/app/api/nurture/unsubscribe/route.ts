import { db } from "@/lib/db";
import { reportError } from "@/lib/report-error";
import { verifyPayload } from "@/lib/nurture/token";

// Public, token-authenticated (signed link, no session; on isServiceApiPath).
// GET shows a confirm page (link scanners must not unsubscribe anyone);
// POST unsubscribes: the List-Unsubscribe-Post one-click target and the page's button.
// Writes the ONE shared suppression list (also honoured by cold email via sendEmail).

type Unsub = { t: number; e: string; l: number };

const page = (body: string, status = 200) =>
  new Response(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Leiratkozás</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px;line-height:1.5">${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

// PROPOSAL copy
export async function GET(request: Request) {
  const url = new URL(request.url);
  const d = url.searchParams.get("d");
  const s = url.searchParams.get("s");
  let ok = false;
  try { ok = verifyPayload<Unsub>("unsub", d, s) != null; } catch { ok = false; }
  if (!ok) return page("<p>A link érvénytelen vagy lejárt.</p>", 400);
  return page(`<h1 style="font-size:22px">Leiratkozás</h1><p>Biztosan nem szeretne több levelet kapni a BetonRadartól?</p>
<form method="post" action="/api/nurture/unsubscribe?d=${encodeURIComponent(d!)}&amp;s=${encodeURIComponent(s!)}"><button type="submit" style="font-size:16px;padding:10px 18px;min-height:44px">Leiratkozom</button></form>`);
}

export async function POST(request: Request) {
  const url = new URL(request.url);
  let p: Unsub | null = null;
  try { p = verifyPayload<Unsub>("unsub", url.searchParams.get("d"), url.searchParams.get("s")); } catch { p = null; }
  if (!p || typeof p.e !== "string" || !Number.isInteger(p.t)) return page("<p>A link érvénytelen vagy lejárt.</p>", 400);
  const email = p.e.trim().toLowerCase();
  try {
    const existing = await db.suppression.findFirst({ where: { tenantId: p.t, email }, select: { id: true } });
    if (!existing) {
      try {
        await db.suppression.create({
          data: { tenantId: p.t, email, requestedAt: new Date(), channel: "email", source: "nurture_unsubscribe", note: `lead #${p.l}` },
        });
      } catch (err) {
        // A retried one-click POST racing the first one: already suppressed is success.
        if ((err as { code?: string }).code !== "P2002") throw err;
      }
    }
    await db.nurtureEnrollment.updateMany({
      where: { tenantId: p.t, leadId: p.l, status: { in: ["active", "paused"] } },
      data: { status: "stopped", stoppedReason: "unsubscribed" },
    });
    await db.appEvent.create({ data: { tenantId: p.t, sourceApp: "ndt-crm", eventType: "nurture_unsubscribed", payload: { leadId: p.l } } });
  } catch (err) {
    reportError("nurture.unsubscribe", err, { leadId: p.l });
    return page("<p>Hiba történt, kérjük, próbálja újra, vagy válaszoljon a levélre ezzel: leiratkozás.</p>", 500);
  }
  return page("<h1 style=\"font-size:22px\">Leiratkozott</h1><p>Több levelet nem küldünk erre a címre.</p>");
}
