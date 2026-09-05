// Server-side árajánlat PDF. Rendered with @react-pdf/renderer (pure JS, no
// headless browser → works on Vercel serverless). Roboto is registered from the
// fontsource CDN using the **latin-ext** subset, which carries the Hungarian
// double-acute glyphs (ő/ű, U+0150/0151, U+0170/0171) that the built-in
// WinAnsi-encoded Helvetica drops. Totals come pre-computed off the quote row
// (decisions.md #9/#15) — this file only lays them out, never recomputes.
import {
  Document,
  Page,
  Text,
  View,
  StyleSheet,
  Font,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { QuoteDTO } from "@/app/actions/quotes";
import { costCodeLabel } from "@/lib/tasks/costing";

// Pinned version (not @latest) so font metrics/glyph coverage can't shift under
// us and a CDN-side change can't break PDF rendering at runtime.
const ROBOTO_VERSION = "5.2.10";
Font.register({
  family: "Roboto",
  fonts: [
    { src: `https://cdn.jsdelivr.net/fontsource/fonts/roboto@${ROBOTO_VERSION}/latin-ext-400-normal.ttf`, fontWeight: 400 },
    { src: `https://cdn.jsdelivr.net/fontsource/fonts/roboto@${ROBOTO_VERSION}/latin-ext-700-normal.ttf`, fontWeight: 700 },
  ],
});

const HUF = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 });
const fmtMoney = (n: number, currency: string) => `${HUF.format(Math.round(n))} ${currency === "HUF" ? "Ft" : currency}`;
const fmtQty = (n: number | null) => (n == null ? "" : new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(n));
const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat("hu-HU").format(d) : "—");

const styles = StyleSheet.create({
  page: { fontFamily: "Roboto", fontSize: 12, paddingTop: 40, paddingBottom: 56, paddingHorizontal: 44, color: "#1f2937" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 24 },
  title: { fontSize: 22, fontWeight: 700, color: "#111827" },
  quoteNo: { fontSize: 12, color: "#6b7280", marginTop: 2 },
  issuer: { textAlign: "right", maxWidth: 240 },
  issuerName: { fontSize: 14, fontWeight: 700 },
  partiesRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 18 },
  partyBlock: { maxWidth: 240 },
  label: { fontSize: 12.5, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  metaRow: { flexDirection: "row", gap: 24, marginBottom: 18 },
  metaItem: { },
  strong: { fontWeight: 700 },
  table: { borderTopWidth: 1, borderColor: "#e5e7eb", marginBottom: 4 },
  th: { flexDirection: "row", backgroundColor: "#f9fafb", borderBottomWidth: 1, borderColor: "#e5e7eb", paddingVertical: 6, paddingHorizontal: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#f3f4f6", paddingVertical: 6, paddingHorizontal: 4 },
  cDesc: { flex: 1 },
  cCode: { width: 64 },
  cNum: { width: 60, textAlign: "right" },
  cUnit: { width: 40, textAlign: "center" },
  cAmt: { width: 78, textAlign: "right" },
  thText: { fontSize: 12.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: 220 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grossRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, marginTop: 4, borderTopWidth: 1, borderColor: "#e5e7eb" },
  grossText: { fontSize: 14, fontWeight: 700, color: "#111827" },
  notes: { marginTop: 24, paddingTop: 10, borderTopWidth: 1, borderColor: "#e5e7eb", color: "#4b5563" },
  footer: { position: "absolute", bottom: 24, left: 44, right: 44, textAlign: "center", fontSize: 12.5, color: "#9ca3af", borderTopWidth: 1, borderColor: "#f3f4f6", paddingTop: 6 },
});

function QuoteDocument({ quote, issuerName }: { quote: QuoteDTO; issuerName: string }) {
  const c = quote.currency;
  return (
    <Document title={`${quote.quoteNumber} — ${quote.title}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.title}>Árajánlat</Text>
            <Text style={styles.quoteNo}>{quote.quoteNumber}</Text>
          </View>
          <View style={styles.issuer}>
            <Text style={styles.issuerName}>{issuerName}</Text>
          </View>
        </View>

        <View style={styles.partiesRow}>
          <View style={styles.partyBlock}>
            <Text style={styles.label}>Ajánlattevő</Text>
            <Text style={styles.strong}>{issuerName}</Text>
          </View>
          <View style={styles.partyBlock}>
            <Text style={styles.label}>Ajánlat címzettje</Text>
            <Text style={styles.strong}>{quote.companyName}</Text>
            {quote.personName ? <Text>{quote.personName}</Text> : null}
          </View>
        </View>

        <View style={styles.metaRow}>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Tárgy</Text>
            <Text>{quote.title}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Kelt</Text>
            <Text>{fmtDate(quote.createdAt)}</Text>
          </View>
          <View style={styles.metaItem}>
            <Text style={styles.label}>Ajánlati kötöttség</Text>
            <Text>{fmtDate(quote.validUntil)}</Text>
          </View>
        </View>

        <View style={styles.table}>
          <View style={styles.th}>
            <Text style={[styles.cCode, styles.thText]}>Kód</Text>
            <Text style={[styles.cDesc, styles.thText]}>Megnevezés</Text>
            <Text style={[styles.cNum, styles.thText]}>Menny.</Text>
            <Text style={[styles.cUnit, styles.thText]}>Egys.</Text>
            <Text style={[styles.cNum, styles.thText]}>Egységár</Text>
            <Text style={[styles.cAmt, styles.thText]}>Összeg</Text>
          </View>
          {quote.items.map((it, i) => (
            <View style={styles.tr} key={i} wrap={false}>
              <Text style={styles.cCode}>{it.costCode ?? ""}</Text>
              <Text style={styles.cDesc}>{it.description}</Text>
              <Text style={styles.cNum}>{fmtQty(it.quantity)}</Text>
              <Text style={styles.cUnit}>{it.unit ?? ""}</Text>
              <Text style={styles.cNum}>{it.unitRate != null ? HUF.format(it.unitRate) : ""}</Text>
              <Text style={styles.cAmt}>{fmtMoney(it.amount, c)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals}>
          <View style={styles.totalRow}>
            <Text>Nettó összesen</Text>
            <Text>{fmtMoney(quote.netAmount, c)}</Text>
          </View>
          <View style={styles.totalRow}>
            <Text>ÁFA ({HUF.format(quote.vatRate)}%)</Text>
            <Text>{fmtMoney(quote.vatAmount, c)}</Text>
          </View>
          <View style={styles.grossRow}>
            <Text style={styles.grossText}>Bruttó összesen</Text>
            <Text style={styles.grossText}>{fmtMoney(quote.grossAmount, c)}</Text>
          </View>
        </View>

        {quote.notes ? (
          <View style={styles.notes}>
            <Text style={styles.label}>Megjegyzés</Text>
            <Text>{quote.notes}</Text>
          </View>
        ) : null}

        <Text style={styles.footer} fixed>
          {issuerName} · {quote.quoteNumber} · Az árajánlat tájékoztató jellegű; az elfogadás nem minősül megrendelésnek.
        </Text>
      </Page>
    </Document>
  );
}

/** Render a quote to a PDF buffer. `issuerName` is the seller (tenant) name. */
export async function renderQuotePdf(quote: QuoteDTO, issuerName: string): Promise<Buffer> {
  return renderToBuffer(<QuoteDocument quote={quote} issuerName={issuerName} />);
}

// Re-exported so callers needn't import from costing just for the label.
export { costCodeLabel };
