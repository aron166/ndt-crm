// Kampányok: one hub for marketing and sales campaigns (mockup A, Áron 2026-11-11).
// Hungarian copy is PROPOSAL until Áron approves it.
import Link from "next/link";
import { PageHeader, Seg } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import { hubList } from "@/lib/campaigns/hub";
import { filterByType, kindLabel, statusLabel, isContentOnly } from "@/lib/campaigns/labels";
import s from "./campaigns.module.css";

export const dynamic = "force-dynamic";
const TENANT_ID = 1;

const TABS = [
  { key: "all", label: "Mind" },
  { key: "cold_call", label: "Hidegtelefon" },
  { key: "cold_email", label: "Hideg e-mail" },
  { key: "sequence", label: "Sorozat" },
  { key: "ad", label: "Hirdetés" },
  { key: "organic", label: "Organikus" },
] as const;

export default async function CampaignsHubPage({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  const { type: raw } = await searchParams;
  const type = TABS.some((t) => t.key === raw) ? raw! : "all";
  const { rows, summary } = await hubList(TENANT_ID);
  const shown = filterByType(rows, type);
  const count = (key: string) => filterByType(rows, key).length;

  return (
    <div className="mount">
      <PageHeader
        title="Kampányok"
        help="Marketing és értékesítés egy helyen. Indítani csak Áron tud."
        actions={<Link href="/campaigns/new" className={`${k.btn} ${k.btnPrimary}`}>Új kampány</Link>}
        filters={<Seg label="Típus" current={type} items={TABS.map((t) => ({ key: t.key, label: `${t.label} ${count(t.key)}`, href: t.key === "all" ? "/campaigns" : `/campaigns?type=${t.key}` }))} />}
      />
      <div className={s.strip} aria-label="Összesítő">
        <span className={s.stripItem}><b>{summary.running}</b> fut</span>
        <span className={s.stripItem}><b>{summary.awaiting}</b> jóváhagyásra vár</span>
        <Link href="/calls" className={s.stripItem}><b>{summary.callsToday}</b> hívás ma</Link>
        <span className={s.stripItem}><b>{summary.leadsThisWeek}</b> lead lett ezen a héten</span>
        <Link href="/marketing" className={s.stripItem}><b>{summary.assetsInReview}</b> anyag vár jóváhagyásra</Link>
      </div>
      {shown.length === 0 ? (
        <div className={k.empty}>Nincs ilyen típusú kampány. <Link href="/campaigns/new" className={k.link}>Új kampány</Link></div>
      ) : (
        <div className={k.tableWrap}>
          <table className={k.table}>
            <thead>
              <tr><th>Kampány</th><th>Típus</th><th>Állapot</th><th>Közönség</th><th>Ma</th><th>Lead lett (hét)</th><th>Felelős</th></tr>
            </thead>
            <tbody>
              {shown.map((r) => (
                <tr key={r.id}>
                  <td><Link href={`/campaigns/${r.slug}`} className={k.name}>{r.name}</Link></td>
                  <td>{kindLabel(r.kind)}</td>
                  <td><span className={s.status} data-s={r.status}><span className={s.dot} aria-hidden />{statusLabel(r.status)}</span></td>
                  <td className={k.num}>{isContentOnly(r.kind) ? "n/a" : r.audience}</td>
                  <td className={k.num}>{r.today == null ? "n/a" : r.today}</td>
                  <td className={k.num}>{r.leadsThisWeek}</td>
                  <td>{r.owner ?? "-"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
