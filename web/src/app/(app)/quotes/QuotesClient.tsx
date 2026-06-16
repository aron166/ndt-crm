"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QuoteListItem } from "@/app/actions/quotes";
import { QUOTE_STATUS_META } from "@/lib/quotes/status";
import { NewQuoteDialog } from "./NewQuoteDialog";
import { formatHUF, formatDate, formatRelativeTime } from "@/lib/utils";

function StatusBadge({ status }: { status: keyof typeof QUOTE_STATUS_META }) {
  const m = QUOTE_STATUS_META[status];
  return (
    <span style={{ fontSize: 11, fontWeight: 600, padding: "2px 8px", borderRadius: 6, color: m.color, background: m.bg }}>
      {m.label}
    </span>
  );
}

const FILTERS = [
  { key: "all", label: "Mind" },
  { key: "draft", label: "Piszkozat" },
  { key: "sent", label: "Elküldve" },
  { key: "accepted", label: "Elfogadva" },
] as const;

export function QuotesClient({ quotes }: { quotes: QuoteListItem[] }) {
  const router = useRouter();
  const [filter, setFilter] = useState<(typeof FILTERS)[number]["key"]>("all");

  const shown = filter === "all" ? quotes : quotes.filter((q) => q.status === filter);

  return (
    <div>
      <div className="flex items-center justify-between mb-5">
        <div>
          <h1 style={{ fontSize: 20, fontWeight: 600, letterSpacing: "-0.02em", margin: 0, color: "var(--fg)" }}>
            Árajánlatok
          </h1>
          <p className="text-sm text-slate-500 mt-1">
            NDT árajánlatok a költségkódok és a díjszabás alapján — küldhető PDF-ként.
          </p>
        </div>
        <NewQuoteDialog />
      </div>

      <div className="flex items-center gap-1.5 mb-3">
        {FILTERS.map((f) => (
          <button key={f.key} onClick={() => setFilter(f.key)}
            className="rounded-md px-2.5 py-1"
            style={{
              fontSize: 12, fontWeight: 500,
              color: filter === f.key ? "var(--fg)" : "var(--fg-soft)",
              background: filter === f.key ? "var(--bg-panel)" : "transparent",
              border: `1px solid ${filter === f.key ? "var(--line-soft)" : "transparent"}`,
            }}>
            {f.label}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="text-sm text-slate-500 py-16 text-center"
          style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 12 }}>
          Még nincs árajánlat. Hozz létre egyet a „+ Új árajánlat" gombbal.
        </div>
      ) : (
        <div style={{ background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 12, overflow: "hidden" }}>
          <table className="w-full text-sm">
            <thead>
              <tr style={{ borderBottom: "1px solid var(--line-soft)" }}>
                {["Sorszám", "Cég", "Tárgy", "Állapot", "Bruttó", "Érvényes", "Létrehozva"].map((h, i) => (
                  <th key={h} style={{ textAlign: i === 4 ? "right" : "left", padding: "10px 12px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.08em", color: "var(--fg-faint)" }}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((q) => (
                <tr key={q.id} onClick={() => router.push(`/quotes/${q.id}`)}
                  className="cursor-pointer hover:bg-[var(--bg-0)]"
                  style={{ borderBottom: "1px solid var(--line-soft)" }}>
                  <td style={{ padding: "10px 12px", fontFamily: "var(--font-mono-ndt)", color: "var(--fg-soft)" }}>{q.quoteNumber}</td>
                  <td style={{ padding: "10px 12px", color: "var(--fg)" }}>{q.companyName}</td>
                  <td style={{ padding: "10px 12px", color: "var(--fg-soft)" }}>{q.title}</td>
                  <td style={{ padding: "10px 12px" }}><StatusBadge status={q.status} /></td>
                  <td style={{ padding: "10px 12px", textAlign: "right", color: "var(--fg)" }}>{formatHUF(q.grossAmount)}</td>
                  <td style={{ padding: "10px 12px", color: "var(--fg-soft)" }}>{q.validUntil ? formatDate(q.validUntil) : "—"}</td>
                  <td style={{ padding: "10px 12px", color: "var(--fg-faint)" }}>{formatRelativeTime(q.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
