// Indítás: before Áron approves, what the e-mail step would send to each open member, counted.
// Server-rendered from lib/campaigns/preview campaignEmailCheck (read only). Hungarian copy is PROPOSAL.

import Link from "next/link";
import k from "@/components/astryx/page.module.css";
import type { EmailCheck as Check } from "@/lib/campaigns/preview";
import s from "../campaigns.module.css";
import { SenderPicker } from "./SenderPicker";

export function EmailCheck({ slug, c, campaignId, senderUserId, senders }: {
  slug: string; c: Check; campaignId: number; senderUserId: number | null; senders: { id: number; name: string }[];
}) {
  if (c.emailSteps === 0) return null;
  return (
    <section className={k.section} aria-label="E-mail ellenőrzés">
      <h2 className={k.groupTitle}>Mi menne ki</h2>
      <SenderPicker campaignId={campaignId} senderUserId={senderUserId} senders={senders} phone={c.sender.phone} />
      <p className={k.strong} style={{ margin: 0 }}>
        {c.complete} / {c.total} tagnak teljes az e-mailje; {c.unresolved} tagnál kitöltetlen mező van; {c.noAddress} tagnak nincs e-mail címe; {c.noAsset} tagnak nincs anyaga.
      </p>
      {c.notLive > 0 && <p className={s.flag}>{c.notLive} anyag még javaslat: jóváhagyásig ezekből nem készül piszkozat.</p>}
      {!c.sender.from && <p className={s.flag}>Nincs feladó (Resend integráció): nem menne ki semmi.</p>}
      {!c.sender.footer && <p className={s.flag}>Nincs leiratkozási lábléc: a küldés elutasítja.</p>}
      {c.rows.length > 0 && (
        <details>
          <summary className={k.link}>Hibás tagok listája ({c.rows.length})</summary>
          <div className={k.tableWrap}>
            <table className={k.table}>
              <thead><tr><th>Cég</th><th>Szegmens</th><th>Mi a gond</th></tr></thead>
              <tbody>
                {c.rows.map((r) => (
                  <tr key={r.memberId}>
                    <td><Link href={`/campaigns/${slug}?tab=members&m=${r.memberId}`} className={k.link}>{r.company}</Link></td>
                    <td>{r.segment ?? <span className={k.muted}>ismeretlen</span>}</td>
                    <td>{r.problems.join("; ")}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      )}
    </section>
  );
}
