"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { Trash2, Plus, FileText, ArrowLeft } from "lucide-react";
import type { QuoteDTO } from "@/app/actions/quotes";
import { updateQuote, setQuoteStatus, deleteQuote } from "@/app/actions/quotes";
import type { CostRateEntry } from "@/app/actions/cost-rates";
import { COST_CODES, costCodeUnitHint } from "@/lib/tasks/costing";
import { quoteTotals, lineAmount } from "@/lib/quotes/calc";
import { QUOTE_STATUS_META, type QuoteStatus } from "@/lib/quotes/status";
import { formatHUF, formatDate } from "@/lib/utils";

const inputStyle: React.CSSProperties = {
  width: "100%", padding: "6px 9px", fontSize: 14,
  background: "var(--bg-0)", border: "1px solid var(--line-soft)",
  borderRadius: 6, color: "var(--fg)", outline: "none",
};

interface EditableLine {
  costCode: string;
  description: string;
  quantity: string;
  unit: string;
  unitRate: string;
}

const toEditable = (q: QuoteDTO): EditableLine[] =>
  q.items.map((i) => ({
    costCode: i.costCode ?? "",
    description: i.description,
    quantity: i.quantity != null ? String(i.quantity) : "",
    unit: i.unit ?? "",
    unitRate: i.unitRate != null ? String(i.unitRate) : "",
  }));

const numOrNull = (s: string): number | null => {
  const t = s.trim().replace(",", ".");
  if (!t) return null;
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
};

// Next status transitions offered from the current one.
const NEXT_ACTIONS: Record<QuoteStatus, QuoteStatus[]> = {
  draft: ["sent"],
  sent: ["accepted", "rejected", "expired"],
  accepted: ["sent"],
  rejected: ["draft", "sent"],
  expired: ["draft", "sent"],
};

export function QuoteBuilderClient({
  quote, contacts, rates,
}: {
  quote: QuoteDTO;
  contacts: Array<{ id: number; name: string }>;
  rates: CostRateEntry[];
}) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);

  const [title, setTitle] = useState(quote.title);
  const [personId, setPersonId] = useState<number | null>(quote.personId);
  const [vatRate, setVatRate] = useState(String(quote.vatRate));
  const [validUntil, setValidUntil] = useState(quote.validUntil ? quote.validUntil.toISOString().slice(0, 10) : "");
  const [notes, setNotes] = useState(quote.notes ?? "");
  const [lines, setLines] = useState<EditableLine[]>(toEditable(quote));

  const linesForCalc = lines.map((l) => ({ quantity: numOrNull(l.quantity), unitRate: numOrNull(l.unitRate) }));
  const totals = quoteTotals(linesForCalc, Number(vatRate.replace(",", ".")) || 0);

  function setLine(idx: number, key: keyof EditableLine, value: string) {
    setLines((ls) => ls.map((l, i) => (i === idx ? { ...l, [key]: value } : l)));
  }

  // Picking a cost code auto-fills unit + rate from the rate card (without clobbering edits).
  function setCostCode(idx: number, code: string) {
    setLines((ls) => ls.map((l, i) => {
      if (i !== idx) return l;
      const next = { ...l, costCode: code };
      const rate = rates.find((r) => r.code === code);
      if (rate) {
        if (!l.unit.trim() && rate.unit) next.unit = rate.unit;
        if (!l.unitRate.trim() && rate.unitRate != null) next.unitRate = String(rate.unitRate);
      }
      return next;
    }));
  }

  function addLine() {
    setLines((ls) => [...ls, { costCode: "", description: "", quantity: "", unit: "", unitRate: "" }]);
  }
  function removeLine(idx: number) {
    setLines((ls) => ls.filter((_, i) => i !== idx));
  }

  function handleSave() {
    setMsg(null);
    const rate = Number(vatRate.replace(",", "."));
    if (!Number.isFinite(rate) || rate < 0) { setMsg({ ok: false, text: "Érvénytelen ÁFA-kulcs" }); return; }
    startTransition(async () => {
      const res = await updateQuote(quote.id, {
        companyId: quote.companyId,
        personId,
        leadId: quote.leadId,
        dealId: quote.dealId,
        title,
        vatRate: rate,
        validUntil: validUntil || null,
        notes,
        lines: lines.map((l) => ({
          costCode: l.costCode || null,
          description: l.description,
          quantity: numOrNull(l.quantity),
          unit: l.unit || null,
          unitRate: numOrNull(l.unitRate),
        })),
      });
      if ("error" in res) { setMsg({ ok: false, text: res.error }); return; }
      router.refresh();
      setMsg({ ok: true, text: "Mentve." });
    });
  }

  function handleStatus(next: QuoteStatus) {
    startTransition(async () => {
      const res = await setQuoteStatus(quote.id, next);
      if ("error" in res) { setMsg({ ok: false, text: res.error }); return; }
      router.refresh();
    });
  }

  function handleDelete() {
    if (!confirm("Biztosan törlöd ezt az árajánlatot? A tételek is törlődnek.")) return;
    startTransition(async () => {
      const res = await deleteQuote(quote.id);
      if ("error" in res) { setMsg({ ok: false, text: res.error }); return; }
      router.push("/quotes");
    });
  }

  const meta = QUOTE_STATUS_META[quote.status];

  return (
    <div className="max-w-4xl">
      <Link href="/quotes" className="inline-flex items-center gap-1 text-sm mb-4" style={{ color: "var(--fg-faint)" }}>
        <ArrowLeft className="size-3.5" /> Árajánlatok
      </Link>

      <div className="flex items-start justify-between mb-5">
        <div>
          <div className="flex items-center gap-2.5">
            <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)" }}>
              {quote.quoteNumber}
            </h1>
            <span style={{ fontSize: 14, fontWeight: 600, padding: "2px 9px", borderRadius: 6, color: meta.color, background: meta.bg }}>
              {meta.label}
            </span>
          </div>
          <Link href={`/companies/${quote.companyId}`} className="text-sm mt-1 inline-block hover:underline" style={{ color: "var(--fg-soft)" }}>
            {quote.companyName}
          </Link>
        </div>
        <div className="flex items-center gap-2">
          <a href={`/quotes/${quote.id}/pdf`} target="_blank" rel="noopener noreferrer" className="btn inline-flex items-center gap-1.5">
            <FileText className="size-3.5" /> PDF
          </a>
          {NEXT_ACTIONS[quote.status].map((next) => (
            <button key={next} className="btn" disabled={pending} onClick={() => handleStatus(next)}>
              {next === "sent" ? "Elküldve" : QUOTE_STATUS_META[next].label}
            </button>
          ))}
        </div>
      </div>

      {/* Header fields */}
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 12 }} className="p-5 mb-4">
        <div className="grid grid-cols-2 gap-4">
          <div className="col-span-2">
            <label style={{ fontSize: 12, color: "var(--fg-faint)" }}>Tárgy</label>
            <input style={{ ...inputStyle, marginTop: 4 }} value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--fg-faint)" }}>Címzett (kapcsolattartó)</label>
            <select style={{ ...inputStyle, marginTop: 4 }} value={personId ?? ""} onChange={(e) => setPersonId(e.target.value ? Number(e.target.value) : null)}>
              <option value="">—</option>
              {contacts.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>
          <div>
            <label style={{ fontSize: 12, color: "var(--fg-faint)" }}>Ajánlati kötöttség (érvényes eddig)</label>
            <input type="date" style={{ ...inputStyle, marginTop: 4 }} value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Line items */}
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 12 }} className="p-5 mb-4">
        <div className="flex items-center justify-between mb-3">
          <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>Tételek</h2>
          <button className="btn inline-flex items-center gap-1.5" onClick={addLine}><Plus className="size-3.5" /> Sor</button>
        </div>

        <table className="w-full text-sm">
          <thead>
            <tr>
              {["Kód", "Megnevezés", "Menny.", "Egység", "Egységár", "Összeg", ""].map((h, i) => (
                <th key={i} style={{ textAlign: i >= 2 && i <= 5 ? "right" : "left", padding: "4px 6px", fontSize: 12, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.06em", color: "var(--fg-faint)" }}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {lines.map((l, idx) => (
              <tr key={idx} style={{ borderTop: "1px solid var(--line-soft)" }}>
                <td style={{ padding: "6px 6px", width: 110 }}>
                  <select style={inputStyle} value={l.costCode} onChange={(e) => setCostCode(idx, e.target.value)}>
                    <option value="">—</option>
                    {COST_CODES.map((c) => <option key={c.value} value={c.value}>{c.value}</option>)}
                  </select>
                </td>
                <td style={{ padding: "6px 6px" }}>
                  <input style={inputStyle} value={l.description} onChange={(e) => setLine(idx, "description", e.target.value)} placeholder="Tétel megnevezése" />
                </td>
                <td style={{ padding: "6px 6px", width: 80 }}>
                  <input type="number" inputMode="decimal" step="any" style={{ ...inputStyle, textAlign: "right" }} value={l.quantity} onChange={(e) => setLine(idx, "quantity", e.target.value)} />
                </td>
                <td style={{ padding: "6px 6px", width: 80 }}>
                  <input style={inputStyle} value={l.unit} onChange={(e) => setLine(idx, "unit", e.target.value)} placeholder={costCodeUnitHint(l.costCode) || ""} />
                </td>
                <td style={{ padding: "6px 6px", width: 110 }}>
                  <input type="number" inputMode="decimal" step="any" style={{ ...inputStyle, textAlign: "right" }} value={l.unitRate} onChange={(e) => setLine(idx, "unitRate", e.target.value)} />
                </td>
                <td style={{ padding: "6px 6px", width: 110, textAlign: "right", color: "var(--fg-soft)", whiteSpace: "nowrap" }}>
                  {formatHUF(lineAmount({ quantity: numOrNull(l.quantity), unitRate: numOrNull(l.unitRate) }))}
                </td>
                <td style={{ padding: "6px 6px", width: 30 }}>
                  <button type="button" onClick={() => removeLine(idx)} style={{ color: "var(--fg-faint)" }} title="Sor törlése">
                    <Trash2 className="size-3.5" />
                  </button>
                </td>
              </tr>
            ))}
            {lines.length === 0 && (
              <tr><td colSpan={7} style={{ padding: "16px 6px", textAlign: "center", color: "var(--fg-faint)" }}>Nincs tétel — adj hozzá sort.</td></tr>
            )}
          </tbody>
        </table>

        {/* Totals */}
        <div className="flex justify-end mt-4">
          <div style={{ width: 280 }}>
            <div className="flex justify-between py-1" style={{ fontSize: 14, color: "var(--fg-soft)" }}>
              <span>Nettó összesen</span><span>{formatHUF(totals.net)}</span>
            </div>
            <div className="flex items-center justify-between py-1" style={{ fontSize: 14, color: "var(--fg-soft)" }}>
              <span className="inline-flex items-center gap-1">
                ÁFA
                <input type="number" inputMode="decimal" step="any" min={0}
                  style={{ ...inputStyle, width: 56, padding: "2px 6px", textAlign: "right" }}
                  value={vatRate} onChange={(e) => setVatRate(e.target.value)} />
                %
              </span>
              <span>{formatHUF(totals.vat)}</span>
            </div>
            <div className="flex justify-between py-2 mt-1" style={{ fontSize: 16, fontWeight: 600, color: "var(--fg)", borderTop: "1px solid var(--line-soft)" }}>
              <span>Bruttó összesen</span><span>{formatHUF(totals.gross)}</span>
            </div>
          </div>
        </div>
      </div>

      {/* Notes */}
      <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 12 }} className="p-5 mb-4">
        <label style={{ fontSize: 12, color: "var(--fg-faint)" }}>Megjegyzés (a dokumentumon megjelenik)</label>
        <textarea rows={3} style={{ ...inputStyle, marginTop: 4, resize: "vertical" }} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="pl. fizetési feltételek, az ár tartalmazza a kiszállást…" />
      </div>

      {/* Action bar */}
      <div className="flex items-center justify-between">
        <button className="btn" disabled={pending} onClick={handleDelete} style={{ color: "var(--coral)" }}>
          Törlés
        </button>
        <div className="flex items-center gap-3">
          {msg && <span style={{ fontSize: 14, color: msg.ok ? "var(--mint)" : "var(--coral)" }}>{msg.ok ? "✓ " : "⚠ "}{msg.text}</span>}
          {quote.sentAt && <span style={{ fontSize: 14, color: "var(--fg-faint)" }}>Elküldve: {formatDate(quote.sentAt)}</span>}
          <button className="btn primary" disabled={pending} onClick={handleSave}>{pending ? "Mentés…" : "Mentés"}</button>
        </div>
      </div>
    </div>
  );
}
