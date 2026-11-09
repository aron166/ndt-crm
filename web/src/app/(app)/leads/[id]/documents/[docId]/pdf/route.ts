import { loadDocument } from "@/lib/documents/service";
import { renderDocumentPdf } from "@/lib/documents/pdf";
import type { DocumentData } from "@/lib/documents/document";
import { reportError } from "@/lib/report-error";

const TENANT_ID = 1;

/**
 * GET /leads/[id]/documents/[docId]/pdf: download a Megrendelő or teljesítésigazolás.
 * Auth: gated by proxy.ts like every (app) route.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string; docId: string }> },
) {
  const { id, docId } = await params;
  if (!/^\d+$/.test(id) || !/^\d+$/.test(docId)) return new Response("Not found", { status: 404 });

  const doc = await loadDocument(parseInt(id, 10), parseInt(docId, 10), TENANT_ID);
  if (!doc) return new Response("Not found", { status: 404 });

  try {
    const pdf = await renderDocumentPdf(doc.number, doc.data as unknown as DocumentData);
    return new Response(new Uint8Array(pdf), {
      status: 200,
      headers: {
        "Content-Type": "application/pdf",
        "Content-Disposition": `inline; filename="${doc.number}.pdf"`,
        "Cache-Control": "no-store",
      },
    });
  } catch (err) {
    reportError("document-pdf", err, { documentId: doc.id });
    return new Response("A dokumentum PDF előállítása nem sikerült", { status: 500 });
  }
}
