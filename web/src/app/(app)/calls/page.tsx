import { getCallQueue, getCallSegments } from "@/app/actions/outreach";
import { Seg } from "@/components/astryx/PageHeader";
import { db } from "@/lib/db";
import { dailyList } from "@/lib/campaigns/service";
import { serializeDates } from "@/lib/serialize";
import CallCockpit from "./CallCockpit";
import { CampaignCallView, type CallViewData } from "./CampaignCallView";

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
  const lists = await Promise.all(running.map((c) => dailyList(TENANT_ID, c.slug)));
  const tabs = running.map((c, i) => {
    const l = lists[i];
    return { key: c.slug, label: `${c.name} ma ${"error" in l ? 0 : l.items.length}`, href: `/calls?campaign=${encodeURIComponent(c.slug)}` };
  });
  const active = tabs.find((t) => t.key === campaign)?.key ?? null;
  const seg = tabs.length > 0
    ? <div style={{ marginBlockEnd: 16 }}><Seg label="Hívólista" current={active ?? "segments"} items={[...tabs, { key: "segments", label: "Szegmensek", href: "/calls" }]} /></div>
    : null;

  if (active) {
    const l = lists[running.findIndex((c) => c.slug === active)];
    if (!("error" in l)) {
      return (
        <div className="mount">
          {seg}
          <CampaignCallView slug={active} data={serializeDates(l) as unknown as CallViewData} />
        </div>
      );
    }
  }
  const [queue, segments] = await Promise.all([getCallQueue(), getCallSegments()]);
  return (
    <>
      {seg}
      <CallCockpit initialQueue={queue} segments={segments} />
    </>
  );
}
