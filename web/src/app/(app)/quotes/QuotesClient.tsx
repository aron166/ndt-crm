"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { QuoteListItem } from "@/app/actions/quotes";
import { QUOTE_STATUS_META } from "@/lib/quotes/status";
import { NewQuoteDialog } from "./NewQuoteDialog";
import { PageHeader } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import q from "./quotes.module.css";
import { formatHUF, formatDate, formatRelativeTime } from "@/lib/utils";

function StatusBadge({ status }: { status: keyof typeof QUOTE_STATUS_META }) {
  const m = QUOTE_STATUS_META[status];
  return (
    <span className={q.badge} style={{ color: m.color, background: m.bg }}>
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

  const filters = (
    <div className={k.seg} role="tablist" aria-label="Állapot">
      {FILTERS.map((f) => (
        <button key={f.key} type="button" role="tab" aria-selected={filter === f.key} onClick={() => setFilter(f.key)}
          className={`${k.segItem} ${q.tab} ${filter === f.key ? k.segItemOn : ""}`}>
          {f.label}
        </button>
      ))}
    </div>
  );

  return (
    <div>
      <PageHeader
        title="Árajánlatok"
        help="NDT árajánlatok a költségkódok és a díjszabás alapján: küldhető PDF-ként."
        actions={<NewQuoteDialog />}
        filters={filters}
      />

      {shown.length === 0 ? (
        <div className={k.empty}>
          Még nincs árajánlat. Hozz létre egyet a „+ Új árajánlat" gombbal.
        </div>
      ) : (
        <div className={k.tableWrap}>
          <table className={k.table}>
            <thead>
              <tr>
                {["Sorszám", "Cég", "Tárgy", "Állapot", "Bruttó", "Érvényes", "Létrehozva"].map((h, i) => (
                  <th key={h} style={i === 4 ? { textAlign: "right" } : undefined}>{h}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {shown.map((qt) => (
                <tr key={qt.id} onClick={() => router.push(`/quotes/${qt.id}`)} className={q.clickRow}>
                  <td className={q.mono}>{qt.quoteNumber}</td>
                  <td>{qt.companyName}</td>
                  <td>{qt.title}</td>
                  <td><StatusBadge status={qt.status} /></td>
                  <td className={q.numCell}>{formatHUF(qt.grossAmount)}</td>
                  <td className={k.num}>{qt.validUntil ? formatDate(qt.validUntil) : "-"}</td>
                  <td style={{ color: "var(--color-text-secondary)" }}>{formatRelativeTime(qt.createdAt)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
