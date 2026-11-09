import { db } from "@/lib/db";
import { loadOfferPdfDoc } from "@/lib/offers/service";
import { renderOfferPdf } from "@/lib/offers/pdf";
import { reportError } from "@/lib/report-error";

const TENANT_ID = 1;

/**
 * GET /leads/[id]/offers/[quoteId]/pdf: download the offer as a PDF.
 * Auth: gated by proxy.ts like every (app) route (only /api/leads is a service path).
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; quoteId: string }> },
) {
  const { id, quoteId } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(quoteId)) return new Response("Not found", { status: 404 });

  const owned = await db.quote.findFirst({
    where: { id: parseInt(quoteId, 10), tenantId: TENANT_ID, leadId: parseInt(id, 10) },
    select: { id: true },
  });
  if (!owned) return new Response("Not found", { status: 404 });

  const doc = await loadOfferPdfDoc(owned.id, TENANT_ID);
  if (!doc) return new Response("Not found", { status: 404 });

  try {
    const pdf = await renderOfferPdf(doc);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.quoteNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    reportError("offer-pdf", err, { quoteId: owned.id });
    return new Response("Az ajánlat PDF előállítása nem sikerült", { status: 500 });
  }
}
