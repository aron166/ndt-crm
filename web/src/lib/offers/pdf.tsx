// Offer PDF (A4, Hungarian). All Hungarian text here and in offer.ts is PROPOSAL
// until Áron approves it. Same @react-pdf/renderer + pinned Roboto latin-ext setup
// as lib/quotes/pdf.tsx; renders ONLY the frozen OfferPdfDoc, never recomputes totals.
import { Document, Page, Text, View, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { PLACEHOLDER, type OfferPdfDoc } from "./offer";

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
const fmtQty = (n: number | null) => (n == null ? PLACEHOLDER : new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(n));
const fmtDate = (d: Date | null) => (d ? new Intl.DateTimeFormat("hu-HU").format(d) : "-");
const ph = (v: string | null) => v ?? PLACEHOLDER;

const styles = StyleSheet.create({
  page: { fontFamily: "Roboto", fontSize: 9, paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, color: "#1f2937" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  brand: { fontSize: 22, fontWeight: 700, color: "#111827" },
  issuer: { textAlign: "right", maxWidth: 260 },
  issuerName: { fontSize: 10, fontWeight: 700 },
  title: { fontSize: 16, fontWeight: 700, color: "#111827" },
  subtitle: { fontSize: 11, marginTop: 2 },
  muted: { color: "#6b7280", marginTop: 2 },
  label: { fontSize: 7.5, color: "#9ca3af", textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 3 },
  block: { marginTop: 16 },
  strong: { fontWeight: 700 },
  para: { marginBottom: 5 },
  th: { flexDirection: "row", backgroundColor: "#f9fafb", borderTopWidth: 1, borderBottomWidth: 1, borderColor: "#e5e7eb", paddingVertical: 6, paddingHorizontal: 4 },
  tr: { flexDirection: "row", borderBottomWidth: 1, borderColor: "#f3f4f6", paddingVertical: 6, paddingHorizontal: 4 },
  cDesc: { flex: 1 },
  cQty: { width: 80, textAlign: "right" },
  cRate: { width: 90, textAlign: "right" },
  cAmt: { width: 90, textAlign: "right" },
  thText: { fontSize: 7.5, fontWeight: 700, color: "#6b7280", textTransform: "uppercase" },
  totals: { marginTop: 10, alignSelf: "flex-end", width: 230 },
  totalRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 3 },
  grossRow: { flexDirection: "row", justifyContent: "space-between", paddingVertical: 6, marginTop: 4, borderTopWidth: 1, borderColor: "#e5e7eb" },
  grossText: { fontSize: 12, fontWeight: 700, color: "#111827" },
  note: { alignSelf: "flex-end", marginTop: 4, fontSize: 8, color: "#6b7280" },
  accept: { marginTop: 18, padding: 10, borderWidth: 1, borderColor: "#111827", fontWeight: 700 },
});

function OfferDocument({ doc }: { doc: OfferPdfDoc }) {
  const c = doc.currency;
  const { issuer } = doc.meta;
  const cu = doc.customer;
  return (
    <Document title={`${doc.quoteNumber}: ${doc.title}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <Text style={styles.brand}>{ph(issuer.brand)}</Text>
          <View style={styles.issuer}>
            <Text style={styles.issuerName}>{ph(issuer.legalName)}</Text>
            <Text>{ph(issuer.address)}</Text>
            <Text>Adószám: {ph(issuer.taxNumber)}</Text>
            <Text>Cégjegyzékszám: {ph(issuer.companyRegNo)}</Text>
            <Text>{ph(issuer.email)}</Text>
            <Text>{ph(issuer.phone)}</Text>
            <Text>Bankszámla: {ph(issuer.bankAccount)}</Text>
          </View>
        </View>

        <Text style={styles.title}>ÁRAJÁNLAT</Text>
        <Text style={styles.subtitle}>{doc.title}</Text>
        <Text style={styles.muted}>{doc.quoteNumber} · Kelt: {fmtDate(doc.createdAt)} · Érvényes: {fmtDate(doc.validUntil)}</Text>

        <View style={styles.block}>
          <Text style={styles.label}>Ajánlat címzettje</Text>
          <Text style={styles.strong}>{cu.company ?? "-"}</Text>
          <Text>{cu.contactName ?? "-"}</Text>
          <Text>{cu.email ?? "-"}</Text>
          <Text>{cu.phone ?? "-"}</Text>
        </View>

        <View style={styles.block}>
          {doc.meta.intro.map((p, i) => <Text key={i} style={styles.para}>{p}</Text>)}
        </View>

        <View style={styles.block}>
          <View style={styles.th}>
            <Text style={[styles.cDesc, styles.thText]}>Megnevezés</Text>
            <Text style={[styles.cQty, styles.thText]}>Mennyiség</Text>
            <Text style={[styles.cRate, styles.thText]}>Egységár</Text>
            <Text style={[styles.cAmt, styles.thText]}>Összeg</Text>
          </View>
          {doc.lines.map((l, i) => (
            <View style={styles.tr} key={i} wrap={false}>
              <Text style={styles.cDesc}>{l.description}</Text>
              <Text style={styles.cQty}>{l.quantity == null ? PLACEHOLDER : `${fmtQty(l.quantity)} ${l.unit ?? ""}`.trim()}</Text>
              <Text style={styles.cRate}>{l.unitRate == null ? PLACEHOLDER : fmtMoney(l.unitRate, c)}</Text>
              <Text style={styles.cAmt}>{l.amount == null ? PLACEHOLDER : fmtMoney(l.amount, c)}</Text>
            </View>
          ))}
        </View>

        <View style={styles.totals} wrap={false}>
          <View style={styles.totalRow}><Text>Nettó összesen</Text><Text>{fmtMoney(doc.totals.net, c)}</Text></View>
          <View style={styles.totalRow}><Text>ÁFA ({HUF.format(doc.vatRate)}%)</Text><Text>{fmtMoney(doc.totals.vat, c)}</Text></View>
          <View style={styles.grossRow}><Text style={styles.grossText}>Bruttó összesen</Text><Text style={styles.grossText}>{fmtMoney(doc.totals.gross, c)}</Text></View>
        </View>
        {doc.totals.complete ? null : <Text style={styles.note}>A végösszeg az egyeztetés alatti tételek nélkül értendő.</Text>}

        <View style={styles.block}>
          {doc.meta.terms.map((p, i) => <Text key={i} style={styles.para}>{p}</Text>)}
        </View>

        <View style={styles.accept} wrap={false}>
          <Text>{doc.meta.acceptance}</Text>
        </View>
      </Page>
    </Document>
  );
}

/** Render an offer to a PDF buffer. */
export async function renderOfferPdf(doc: OfferPdfDoc): Promise<Buffer> {
  return renderToBuffer(<OfferDocument doc={doc} />);
}
