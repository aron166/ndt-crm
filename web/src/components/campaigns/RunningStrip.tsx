"use client";
// "Futó kampányok": audience, touched, replied, promoted, booked per running campaign, by step
// or by day, all computed from the append-only campaign_events (lib/campaigns/analytics).
// Hungarian copy is PROPOSAL until Áron approves it.

import { useState } from "react";
import Link from "next/link";
import k from "@/components/astryx/page.module.css";
import s from "@/app/(app)/campaigns/campaigns.module.css";
import { kindLabel, isContentOnly } from "@/lib/campaigns/labels";
import type { CampaignStatsV2, Revenue } from "@/lib/campaigns/analytics";
import { REPORT_UI, revenueLines, revenueNote } from "@/lib/reports/labels";
import { formatHUF } from "@/lib/utils";

export interface StripRow { campaign: { slug: string; name: string; kind: string | null }; stats: CampaignStatsV2; revenue?: Revenue }

const VIEWS = [{ key: "total", label: "Összesen" }, { key: "step", label: "Lépés szerint" }, { key: "day", label: "Nap szerint" }, { key: "revenue", label: "Bevétel" }] as const;
type View = (typeof VIEWS)[number]["key"];

export function RunningStrip({ rows, title = "Futó kampányok" }: { rows: StripRow[]; title?: string }) {
  const [view, setView] = useState<View>("total");
  return (
    <section aria-label={title} style={{ marginBlockEnd: 24 }}>
      <div className={k.groupHead} style={{ justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 className={k.groupTitle}>{title}</h2>
        <div className={k.seg} role="group" aria-label="Bontás">
          {VIEWS.map((v) => (
            <button key={v.key} type="button" aria-pressed={view === v.key} onClick={() => setView(v.key)}
              className={`${k.segItem} ${s.segBtn} ${view === v.key ? k.segItemOn : ""}`}>
              {v.label}
            </button>
          ))}
        </div>
      </div>
      {rows.length === 0 ? (
        <p className={k.muted}>Nincs futó kampány.</p>
      ) : (
        <div className={k.tableWrap}>
          <table className={k.table}>
            <thead>
              {view === "revenue" ? (
                <tr><th>Kampány</th><th>Bontás</th><th>{REPORT_UI.revenueWon}</th><th>{REPORT_UI.revenueWonValue}</th><th>{REPORT_UI.revenueConverted}</th><th>{REPORT_UI.revenueConvertedValue}</th></tr>
              ) : view === "total" ? (
                <tr><th>Kampány</th><th>Közönség</th><th>Érintve</th><th>Válaszolt</th><th>Lead lett</th><th>Foglalt</th></tr>
              ) : (
                <tr><th>Kampány</th><th>{view === "step" ? "Lépés" : "Nap"}</th><th>Érintés</th><th>Válasz</th><th>Lead lett</th></tr>
              )}
            </thead>
            <tbody>
              {rows.flatMap((r) => {
                const name = <Link href={`/campaigns/${r.campaign.slug}`} className={k.strong}>{r.campaign.name}</Link>;
                const kind = <span className={k.muted}> {kindLabel(r.campaign.kind).toLowerCase()}</span>;
                if (view === "revenue") {
                  const lines = r.revenue ? revenueLines(r.revenue) : [];
                  if (lines.length === 0) return [<tr key={r.campaign.slug}><td>{name}{kind}</td><td colSpan={5} className={k.muted}>{REPORT_UI.revenueNone}</td></tr>];
                  const note = revenueNote(r.revenue!);
                  return [...lines.map((x, i) => (
                    <tr key={`${r.campaign.slug}-${x.label}`}>
                      <td>{i === 0 ? <>{name}{kind}</> : null}</td>
                      <td>{x.label}</td>
                      <td className={k.num}>{x.won}</td>
                      <td className={k.num}>{formatHUF(x.wonValue)}</td>
                      <td className={k.num}>{x.converted}</td>
                      <td className={k.num}>{formatHUF(x.convertedValue)}</td>
                    </tr>
                  )), ...(note ? [<tr key={`${r.campaign.slug}-note`}><td /><td colSpan={5} className={k.muted}>{note}</td></tr>] : [])];
                }
                if (view === "total") {
                  const na = isContentOnly(r.campaign.kind);
                  return [(
                    <tr key={r.campaign.slug}>
                      <td>{name}{kind}</td>
                      <td className={k.num}>{na ? "n/a" : r.stats.audience}</td>
                      <td className={k.num}>{r.stats.touched}</td>
                      <td className={k.num}>{r.stats.replied}</td>
                      <td className={k.num}>{r.stats.promoted}</td>
                      <td className={k.num}>{r.stats.booked}</td>
                    </tr>
                  )];
                }
                const parts = view === "step"
                  ? r.stats.byStep.map((x) => ({ key: `${x.step}`, label: `${x.step}. lépés`, a: x.touched, b: x.replied, c: x.promoted }))
                  : r.stats.byDay.map((x) => ({ key: x.day, label: x.day, a: x.touches, b: x.replies, c: x.promoted }));
                if (parts.length === 0) return [<tr key={r.campaign.slug}><td>{name}{kind}</td><td colSpan={4} className={k.muted}>Még nincs érintés</td></tr>];
                return parts.map((p, i) => (
                  <tr key={`${r.campaign.slug}-${p.key}`}>
                    <td>{i === 0 ? <>{name}{kind}</> : null}</td>
                    <td className={k.num}>{p.label}</td>
                    <td className={k.num}>{p.a}</td>
                    <td className={k.num}>{p.b}</td>
                    <td className={k.num}>{p.c}</td>
                  </tr>
                ));
              })}
            </tbody>
          </table>
        </div>
      )}
      <p className={k.muted} style={{ marginTop: 8 }}>Minden szám a kampánytagokból, az érintésnaplóból és a leadekből számolódik. Hirdetés és organikus: kézzel rögzített számok az anyagoknál.</p>
    </section>
  );
}
