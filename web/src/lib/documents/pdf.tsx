// Lead document PDFs (A4, Hungarian): Megrendelő and teljesítésigazolás. Hungarian copy
// is PROPOSAL until Áron approves it. Same pinned Roboto setup as lib/offers/pdf.tsx;
// renders ONLY the frozen DocumentData, never recomputes anything.
import { Document, Page, Text, View, Image, StyleSheet, Font, renderToBuffer } from "@react-pdf/renderer";
import { PLACEHOLDER } from "@/lib/offers/offer";
import { DOCUMENT_TITLE, ORDER_VALIDITY, type DocumentData, type Party } from "./document";

const ROBOTO_VERSION = "5.2.10";
Font.register({
  family: "Roboto",
  fonts: [
    { src: `https://cdn.jsdelivr.net/fontsource/fonts/roboto@${ROBOTO_VERSION}/latin-ext-400-normal.ttf`, fontWeight: 400 },
    { src: `https://cdn.jsdelivr.net/fontsource/fonts/roboto@${ROBOTO_VERSION}/latin-ext-700-normal.ttf`, fontWeight: 700 },
  ],
});

const HUF = new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 0 });
const fmtMoney = (n: number) => `${HUF.format(Math.round(n))} Ft`;
const fmtQty = (n: number) => new Intl.NumberFormat("hu-HU", { maximumFractionDigits: 2 }).format(n);
const DATE_TIME = new Intl.DateTimeFormat("hu-HU", { dateStyle: "short", timeStyle: "short", timeZone: "Europe/Budapest" });
const fmtDateTime = (iso: string) => DATE_TIME.format(new Date(iso));
const ph = (v: string | null) => v ?? PLACEHOLDER;

const styles = StyleSheet.create({
  page: { fontFamily: "Roboto", fontSize: 9, paddingTop: 40, paddingBottom: 48, paddingHorizontal: 44, color: "#1f2937" },
  headerRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 20 },
  brand: { fontSize: 22, fontWeight: 700, color: "#111827" },
  issuer: { textAlign: "right", maxWidth: 260 },
  issuerName: { fontSize: 10, fontWeight: 700 },
  title: { fontSize: 20, fontWeight: 700, color: "#111827" },
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
  box: { marginTop: 16, padding: 10, borderWidth: 1, borderColor: "#111827" },
  sigRow: { flexDirection: "row", justifyContent: "space-between", marginTop: 60 },
  sigCol: { width: 200, borderTopWidth: 1, borderColor: "#111827", paddingTop: 4, textAlign: "center" },
  sigImg: { marginTop: 6, width: 220, height: 90, borderWidth: 1, borderColor: "#e5e7eb" },
});

function CustomerBlock({ cu, label }: { cu: Party; label: string }) {
  return (
    <View style={styles.block}>
      <Text style={styles.label}>{label}</Text>
      <Text style={styles.strong}>{cu.company ?? "-"}</Text>
      <Text>{cu.contactName ?? "-"}</Text>
      <Text>{cu.email ?? "-"}</Text>
      <Text>{cu.phone ?? "-"}</Text>
    </View>
  );
}

function Doc({ number, data }: { number: string; data: DocumentData }) {
  const { issuer } = data;
  return (
    <Document title={`${DOCUMENT_TITLE[data.kind]} ${number}`}>
      <Page size="A4" style={styles.page}>
        <View style={styles.headerRow}>
          <View>
            <Text style={styles.brand}>{ph(issuer.brand)}</Text>
            {issuer.website ? <Text style={styles.muted}>{issuer.website}</Text> : null}
          </View>
          <View style={styles.issuer}>
            <Text style={styles.issuerName}>{ph(issuer.legalName)}</Text>
            <Text>{ph(issuer.address)}</Text>
            <Text>Adószám: {ph(issuer.taxNumber)}</Text>
            <Text>Cégjegyzékszám: {ph(issuer.companyRegNo)}</Text>
            {issuer.email ? <Text>{issuer.email}</Text> : null}
            {issuer.phone ? <Text>{issuer.phone}</Text> : null}
            {issuer.bankAccount ? <Text>Bankszámla: {issuer.bankAccount}</Text> : null}
          </View>
        </View>

        <Text style={styles.title}>{DOCUMENT_TITLE[data.kind]}</Text>
        <Text style={styles.muted}>{number}</Text>

        {data.kind === "order" ? (
          <>
            <CustomerBlock cu={data.customer} label="Megrendelő" />
            <View style={styles.block}>
              <Text>Ajánlat: {data.quoteNumber}</Text>
              <Text>Elfogadva: {fmtDateTime(data.acceptedAt)}</Text>
            </View>

            <View style={styles.block}>
              <View style={styles.th}>
                <Text style={[styles.cDesc, styles.thText]}>Megnevezés</Text>
                <Text style={[styles.cQty, styles.thText]}>Mennyiség</Text>
                <Text style={[styles.cRate, styles.thText]}>Egységár</Text>
                <Text style={[styles.cAmt, styles.thText]}>Összeg</Text>
              </View>
              {data.lines.map((l, i) => (
                <View style={styles.tr} key={i} wrap={false}>
                  <Text style={styles.cDesc}>{l.description}</Text>
                  <Text style={styles.cQty}>{l.quantity == null ? PLACEHOLDER : `${fmtQty(l.quantity)} ${l.unit ?? ""}`.trim()}</Text>
                  <Text style={styles.cRate}>{l.unitRate == null ? PLACEHOLDER : fmtMoney(l.unitRate)}</Text>
                  <Text style={styles.cAmt}>{l.amount == null ? PLACEHOLDER : fmtMoney(l.amount)}</Text>
                </View>
              ))}
            </View>

            <View style={styles.totals} wrap={false}>
              <View style={styles.totalRow}><Text>Nettó összesen</Text><Text>{fmtMoney(data.totals.net)}</Text></View>
              <View style={styles.totalRow}><Text>ÁFA ({HUF.format(data.vatRate)}%)</Text><Text>{fmtMoney(data.totals.vat)}</Text></View>
              <View style={styles.grossRow}><Text style={styles.grossText}>Bruttó összesen</Text><Text style={styles.grossText}>{fmtMoney(data.totals.gross)}</Text></View>
            </View>

            <View style={styles.block}>
              {data.terms.map((p, i) => <Text key={i} style={styles.para}>{p}</Text>)}
            </View>

            <View style={[styles.box, { fontWeight: 700 }]} wrap={false}>
              <Text>{ORDER_VALIDITY}</Text>
            </View>

            <View style={styles.sigRow} wrap={false}>
              <Text style={styles.sigCol}>Megrendelő aláírása</Text>
              <Text style={styles.sigCol}>Vállalkozó aláírása</Text>
            </View>
          </>
        ) : (
          <>
            <CustomerBlock cu={data.customer} label="Megrendelő" />
            <View style={styles.block}>
              <Text>Megrendelő: {data.orderNumber ?? "-"}</Text>
            </View>
            <View style={styles.block}>
              <Text style={styles.strong}>Elvégzett munka:</Text>
              <Text>{data.doneScope}</Text>
            </View>
            {data.scopeChange ? (
              <View style={styles.box} wrap={false}>
                <Text style={styles.strong}>Helyszíni módosítás:</Text>
                <Text>{data.scopeChange.text}</Text>
                <Text style={styles.strong}>Új nettó ár: {fmtMoney(data.scopeChange.newNetHuf)} + ÁFA</Text>
              </View>
            ) : null}
            <View style={styles.block} wrap={false}>
              <Text>Aláíró: {data.signerName}</Text>
              <Text>Aláírás időpontja: {fmtDateTime(data.signedAt)}</Text>
              {/* eslint-disable-next-line jsx-a11y/alt-text -- react-pdf Image has no alt */}
              <Image src={data.signature} style={styles.sigImg} />
            </View>
          </>
        )}
      </Page>
    </Document>
  );
}

/** Render a lead document (Megrendelő or teljesítésigazolás) to a PDF buffer. */
export async function renderDocumentPdf(number: string, data: DocumentData): Promise<Buffer> {
  return renderToBuffer(<Doc number={number} data={data} />);
}
