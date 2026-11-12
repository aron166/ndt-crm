import { reportError } from "@/lib/report-error";
import { verifyPayload } from "@/lib/outreach/token";
import { applyOptOut } from "@/lib/outreach/unsubscribe";

// Public, token-authenticated (signed link, no session; on isServiceApiPath).
// GET shows a confirm page (link scanners must not unsubscribe anyone);
// POST unsubscribes: the List-Unsubscribe-Post one-click target and the page's button.
// The response never reveals whether the address exists or was already suppressed.

type Unsub = { t: number; e: string; r: number };

const page = (body: string, status = 200) =>
  new Response(`<!doctype html><html lang="hu"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Leiratkozás</title></head><body style="font-family:system-ui,sans-serif;max-width:520px;margin:48px auto;padding:0 16px;line-height:1.5">${body}</body></html>`,
    { status, headers: { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store", "X-Robots-Tag": "noindex" } });

const INVALID = "<p>A link érvénytelen vagy lejárt.</p>";

function token(url: URL): Unsub | null {
  let p: Unsub | null = null;
  try { p = verifyPayload<Unsub>("unsub", url.searchParams.get("d"), url.searchParams.get("s")); } catch { p = null; }
  if (!p || typeof p.e !== "string" || !Number.isInteger(p.t)) return null;
  return p;
}

// PROPOSAL copy
export async function GET(request: Request) {
  const url = new URL(request.url);
  if (!token(url)) return page(INVALID, 400);
  const d = encodeURIComponent(url.searchParams.get("d")!);
  const s = encodeURIComponent(url.searchParams.get("s")!);
  return page(`<h1 style="font-size:22px">Leiratkozás</h1><p>Biztosan nem szeretne több levelet kapni tőlünk?</p>
<form method="post" action="/api/outreach/unsubscribe?d=${d}&amp;s=${s}"><button type="submit" style="font-size:16px;padding:10px 18px;min-height:44px">Leiratkozom</button></form>`);
}

export async function POST(request: Request) {
  const p = token(new URL(request.url));
  if (!p) return page(INVALID, 400);
  try {
    await applyOptOut(p.t, p.e, { kind: "unsubscribe", source: "unsubscribe_link", draftId: Number.isInteger(p.r) ? p.r : null, agent: "unsubscribe" });
  } catch (err) {
    reportError("outreach.unsubscribe", err, { tenantId: p.t, draftId: p.r });
    return page("<p>Hiba történt, kérjük, próbálja újra, vagy válaszoljon a levélre ezzel: leiratkozás.</p>", 500);
  }
  return page("<h1 style=\"font-size:22px\">Leiratkozott</h1><p>Több levelet nem küldünk erre a címre.</p>");
}
