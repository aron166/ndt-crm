// Lead documents (raw60 D13/D16, Áron 2026-11-09). PURE: the frozen data shapes,
// numbering, and the builders. The Megrendelő is made from the accepted offer; the
// teljesítésigazolás from the on-site sign-off. The PDF (lib/documents/pdf.tsx)
// renders ONLY this frozen data, so a document never changes after it is made.
// Hungarian text is PROPOSAL until Áron approves it.
import type { OfferLine, OfferPdfDoc } from "@/lib/offers/offer";

export const DOCUMENT_KINDS = ["order", "completion"] as const;
export type DocumentKind = (typeof DOCUMENT_KINDS)[number];
export const DOCUMENT_PREFIX: Record<DocumentKind, string> = { order: "MR", completion: "TI" };
export const DOCUMENT_TITLE: Record<DocumentKind, string> = { order: "Megrendelő", completion: "Teljesítésigazolás" };

/** MR-2026-0001 style; max + 1 over the numbers already issued that year (caller retries on a collision). */
export function nextDocumentNumber(kind: DocumentKind, existing: readonly string[], year: number): string {
  const re = new RegExp(`^${DOCUMENT_PREFIX[kind]}-${year}-(\\d+)$`);
  let max = 0;
  for (const n of existing) {
    const m = re.exec(n);
    if (m) max = Math.max(max, Number(m[1]));
  }
  return `${DOCUMENT_PREFIX[kind]}-${year}-${String(max + 1).padStart(4, "0")}`;
}

export interface Party {
  company: string | null;
  contactName: string | null;
  email: string | null;
  phone: string | null;
}

export interface OrderData {
  kind: "order";
  issuer: OfferPdfDoc["meta"]["issuer"];
  customer: Party;
  /** The accepted offer this order comes from. */
  quoteNumber: string;
  title: string;
  lines: OfferLine[];
  vatRate: number;
  totals: { net: number; vat: number; gross: number; complete: boolean };
  terms: string[];
  validity: string;
  acceptedAt: string; // ISO
}

export interface CompletionData {
  kind: "completion";
  issuer: OfferPdfDoc["meta"]["issuer"];
  customer: Party;
  /** The order it completes, when there is one. */
  orderNumber: string | null;
  /** Who signed on site, as typed on the tablet. */
  signerName: string;
  /** PNG data URL of the signature canvas. */
  signature: string;
  signedAt: string; // ISO, server time
  doneScope: string;
  /** Optional on-site scope change with its new net price. */
  scopeChange: { text: string; newNetHuf: number } | null;
}

export type DocumentData = OrderData | CompletionData;

export const ORDER_VALIDITY = "A megrendelés a munka elvégzéséig érvényes.";

/** Pure: the Megrendelő from the accepted offer's frozen document. */
export function buildOrderData(offer: OfferPdfDoc, acceptedAt: Date): OrderData {
  return {
    kind: "order",
    issuer: offer.meta.issuer,
    customer: offer.customer,
    quoteNumber: offer.quoteNumber,
    title: offer.title,
    lines: offer.lines,
    vatRate: offer.vatRate,
    totals: offer.totals,
    terms: [
      `A megrendelés a(z) ${offer.quoteNumber} számú ajánlat elfogadásával jött létre.`,
      "A helyszíni munka időpontját telefonon egyeztetjük.",
      "A számlát a munka elvégzése után állítjuk ki.",
    ],
    validity: ORDER_VALIDITY,
    acceptedAt: acceptedAt.toISOString(),
  };
}

export const SIGNATURE_MAX_BYTES = 300_000;
export const SIGNOFF_TEXT_MAX = 2000;

/** Pure validation of the sign-off input; returns the first problem in Hungarian, or null. */
export function signOffIssue(input: {
  signerName: string; signature: string; doneScope: string;
  scopeChange?: { text: string; newNetHuf: number } | null;
}): string | null {
  if (input.signerName.trim().length < 2) return "Add meg az aláíró nevét";
  if (!/^data:image\/png;base64,[A-Za-z0-9+/=]+$/.test(input.signature)) return "Hiányzik az aláírás";
  if (input.signature.length > SIGNATURE_MAX_BYTES) return "Az aláírás túl nagy, töröld és írd alá újra";
  if (input.doneScope.trim().length < 3) return "Írd le röviden az elvégzett munkát";
  if (input.doneScope.length > SIGNOFF_TEXT_MAX) return "Az elvégzett munka leírása túl hosszú";
  if (input.scopeChange) {
    if (input.scopeChange.text.trim().length < 3) return "Írd le a módosítást";
    if (!Number.isFinite(input.scopeChange.newNetHuf) || input.scopeChange.newNetHuf < 0) return "Add meg az új nettó árat";
  }
  return null;
}
