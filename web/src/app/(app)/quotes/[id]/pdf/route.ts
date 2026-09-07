import { db } from "@/lib/db";
import { getQuote } from "@/app/actions/quotes";
import { renderQuotePdf } from "@/lib/quotes/pdf";
import { reportError } from "@/lib/report-error";

const TENANT_ID = 1;

/**
 * GET /quotes/[id]/pdf — download the árajánlat as a PDF.
 * Auth: gated by proxy.ts like every (app) route. Tenant-scoped via getQuote.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) return new Response("Not found", { status: 404 });

  const quote = await getQuote(parseInt(id, 10));
  if (!quote) return new Response("Not found", { status: 404 });

  const tenant = await db.tenant.findUnique({
    where: { id: TENANT_ID },
    select: { name: true },
  });

  try {
    const pdf = await renderQuotePdf(quote, tenant?.name ?? "");
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${quote.quoteNumber}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    reportError("quote-pdf", err, { quoteId: quote.id });
    return new Response("Az árajánlat PDF előállítása nem sikerült", { status: 500 });
  }
}
