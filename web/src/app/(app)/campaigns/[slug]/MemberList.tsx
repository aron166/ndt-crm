"use client";
// Tagok: every member of the campaign, one row each; a row opens the prospect quick view
// (?m=<id> opens one directly, e.g. from the launch-tab check). Hungarian copy is PROPOSAL.

import { useState } from "react";
import k from "@/components/astryx/page.module.css";
import { memberStateLabel } from "@/lib/campaigns/labels";
import { SEGMENTS, type SegmentKey } from "@/lib/campaigns/email-preview";
import { MemberQuickView } from "@/components/campaigns/MemberQuickView";
import s from "../campaigns.module.css";

export interface MemberRowView {
  id: number; company: string; city: string | null; tier: string | null; lane: string | null;
  segment: SegmentKey | null; state: string; stepPosition: number;
}

export function MemberList({ slug, rows, openId }: { slug: string; rows: MemberRowView[]; openId?: number | null }) {
  const [open, setOpen] = useState<number | null>(openId ?? null);
  return (
    <section className={k.section} aria-label="Tagok">
      <h2 className={k.groupTitle}>Tagok ({rows.length})</h2>
      {rows.length === 0 ? <p className={k.muted}>Még nincs tag. Tölts be egy listát lent.</p> : (
        <div className={k.tableWrap}>
          <table className={k.table}>
            <thead><tr><th>Cég</th><th>Szegmens</th><th>Város</th><th>Szint</th><th>Állapot</th><th>Lépés</th></tr></thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id}>
                  <td><button type="button" className={s.rowBtn} onClick={() => setOpen(r.id)} aria-haspopup="dialog">{r.company}</button></td>
                  <td title={r.segment ? SEGMENTS[r.segment] : undefined}>{r.segment ?? <span className={k.muted}>ismeretlen</span>}{r.lane ? <span className={k.muted}> · {r.lane}</span> : null}</td>
                  <td>{r.city ?? <span className={k.muted}>-</span>}</td>
                  <td>{r.tier ?? <span className={k.muted}>-</span>}</td>
                  <td>{memberStateLabel(r.state)}</td>
                  <td className={k.num}>{r.stepPosition}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
      <MemberQuickView slug={slug} memberId={open} onClose={() => setOpen(null)} />
    </section>
  );
}
