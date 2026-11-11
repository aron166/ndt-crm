// Kampányok: one hub for marketing and sales campaigns (mockup A, Áron 2026-11-11).
// Hungarian copy is PROPOSAL until Áron approves it.
import Link from "next/link";
import { Seg } from "@/components/astryx/PageHeader";
import k from "@/components/astryx/page.module.css";
import { db } from "@/lib/db";
import { hubList } from "@/lib/campaigns/hub";
import { MarketingHeader } from "../marketing/MarketingTabs";
import { CampaignsClient } from "../marketing/campaigns/CampaignsClient";
import CampaignDashboard from "../outreach/campaigns/CampaignDashboard";
import { listCampaignKeys, listSenders, getCampaignStats, getCampaignStepTemplates } from "@/app/actions/outreach-campaigns";
import { typeTabLabel, filterByType, kindLabel, statusLabel, isContentOnly } from "@/lib/campaigns/labels";
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
  // The two older campaign screens, folded in so there is one campaigns page (Áron 2026-11-11).
  { key: "marketing", label: "Marketing (régi)" },
  { key: "outreach", label: "Kiküldés" },
] as const;

const intOrNull = (v: string | undefined) => {
  const n = v ? parseInt(v, 10) : NaN;
  return Number.isFinite(n) ? n : null;
};

export default async function CampaignsHubPage({ searchParams }: { searchParams: Promise<{ type?: string; campaign?: string; sender?: string; wave?: string }> }) {
  const sp = await searchParams;
  const raw = sp.type;
  const type = TABS.some((t) => t.key === raw) ? raw! : "all";
  const { rows, summary } = await hubList(TENANT_ID);
  const shown = filterByType(rows, type);
  const count = (key: string) => filterByType(rows, key).length;

  return (
    <div className="mount">
      <MarketingHeader
        active="campaigns"
        title="Kampányok"
        help="Marketing és értékesítés egy helyen. Indítani csak Áron tud."
        actions={<>{type === "outreach" && <Link href="/outreach" className={k.btn}>Outreach piszkozatok</Link>}<Link href="/campaigns/new" className={`${k.btn} ${k.btnPrimary}`}>Új kampány</Link></>}
        filters={<Seg label="Típus" current={type} items={TABS.map((t) => ({ key: t.key, label: typeTabLabel(t.key, t.label, count(t.key)), href: t.key === "all" ? "/campaigns" : `/campaigns?type=${t.key}` }))} />}
      />
      <div className={s.strip} aria-label="Összesítő">
        <span className={s.stripItem}><b>{summary.running}</b> fut</span>
        <span className={s.stripItem}><b>{summary.awaiting}</b> jóváhagyásra vár</span>
        <Link href="/calls" className={s.stripItem}><b>{summary.callsToday}</b> hívás ma</Link>
        <span className={s.stripItem}><b>{summary.leadsThisWeek}</b> lead lett ezen a héten</span>
        <Link href="/marketing" className={s.stripItem}><b>{summary.assetsInReview}</b> anyag vár jóváhagyásra</Link>
      </div>
      {type === "marketing" ? await legacyList() : type === "outreach" ? await outreachStats(sp) : shown.length === 0 ? (
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

/** The old /marketing/campaigns list: pre-v2 segment campaigns with their audience, sender and wave. */
async function legacyList() {
  const [campaigns, senders] = await Promise.all([
    db.campaign.findMany({
      where: { tenantId: TENANT_ID, OR: [{ kind: null }, { kind: "content" }] },
      orderBy: [{ isArchived: "asc" }, { name: "asc" }],
      select: {
        id: true, name: true, description: true, isArchived: true, slug: true, currentWave: true,
        audienceView: { select: { id: true, name: true } },
        sender: { select: { name: true } },
        _count: { select: { contentItems: true } },
      },
    }),
    listSenders(),
  ]);
  return (
    <CampaignsClient
      campaigns={campaigns.map((c) => ({
        id: c.id, name: c.name, description: c.description, isArchived: c.isArchived, slug: c.slug,
        senderName: c.sender?.name ?? null, currentWave: c.currentWave, audienceName: c.audienceView?.name ?? null,
        contentCount: c._count.contentItems,
      }))}
      senders={senders}
    />
  );
}

/** The old /outreach/campaigns dashboard: sends, replies and step templates per outbound key. */
async function outreachStats(sp: { campaign?: string; sender?: string; wave?: string }) {
  const [campaigns, senders] = await Promise.all([listCampaignKeys(), listSenders()]);
  const campaign = sp.campaign || campaigns[0];
  if (!campaign) return <div className={k.empty}>Nincs adat ehhez a kampányhoz.</div>;
  const senderUserId = intOrNull(sp.sender);
  const wave = intOrNull(sp.wave);
  const [result, stepTemplates] = await Promise.all([
    getCampaignStats({ campaign, senderUserId, wave }),
    getCampaignStepTemplates(campaign),
  ]);
  const stats = result && !("ok" in result) ? result : null;
  return <CampaignDashboard campaigns={campaigns} senders={senders} campaign={campaign} senderUserId={senderUserId} wave={wave} stats={stats} stepTemplates={stepTemplates} />;
}
