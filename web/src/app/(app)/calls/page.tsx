import { getCallQueue, getCallSegments } from "@/app/actions/outreach";
import { Seg } from "@/components/astryx/PageHeader";
import { db } from "@/lib/db";
import { dailyList } from "@/lib/campaigns/service";
import { serializeDates } from "@/lib/serialize";
import CallCockpit from "./CallCockpit";
import { CampaignCallView, type CallViewData } from "./CampaignCallView";
import s from "../campaigns/campaigns.module.css";

// The queue is live (pipeline status + freshness change as you work it).
export const dynamic = "force-dynamic";
const TENANT_ID = 1;

export default async function CallsPage({ searchParams }: { searchParams: Promise<{ campaign?: string }> }) {
  const { campaign } = await searchParams;
  // Campaign tabs (Kampányok hub, variant A): running campaigns with a call step, each with
  // today's capped list computed on read. The page name and the segment cockpit stay.
  const running = await db.campaign.findMany({
    where: { tenantId: TENANT_ID, status: "running", steps: { some: { channel: "call" } } },
    select: { slug: true, name: true },
    orderBy: { createdAt: "asc" },
  });
  // Only the open tab computes its list (Vanda #191-4); the others show their name.
  const wanted = running.find((c) => c.slug === campaign) ?? null;
  const list = wanted ? await dailyList(TENANT_ID, wanted.slug) : null;
  const active = list && !("error" in list) ? wanted!.slug : null;
  const tabs = running.map((c) => ({
    key: c.slug,
    label: c.slug === active && list && !("error" in list) ? `${c.name} ma ${list.items.length}` : c.name,
    href: `/calls?campaign=${encodeURIComponent(c.slug)}`,
  }));
  const seg = tabs.length > 0
    ? <div className={s.tabs}><Seg label="Hívólista" current={active ?? "segments"} items={[...tabs, { key: "segments", label: "Szegmensek", href: "/calls" }]} /></div>
    : null;

  if (active && list && !("error" in list)) {
    return (
      <div className="mount">
        {seg}
        {/* key: a tab switch starts a fresh view, never the previous campaign's note or message (Vanda, PR 191 item 2). */}
        <CampaignCallView key={active} slug={active} data={serializeDates(list) as unknown as CallViewData} />
      </div>
    );
  }
  const [queue, segments] = await Promise.all([getCallQueue(), getCallSegments()]);
  return (
    <>
      {seg}
      <CallCockpit initialQueue={queue} segments={segments} />
    </>
  );
}
