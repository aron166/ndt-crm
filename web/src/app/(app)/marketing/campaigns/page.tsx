import { db } from "@/lib/db";
import { MarketingTabs } from "../MarketingTabs";
import { CampaignsClient } from "./CampaignsClient";
import { listSenders } from "@/app/actions/outreach-campaigns";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const [campaigns, senders] = await Promise.all([
    db.campaign.findMany({
      where: { tenantId: TENANT_ID },
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
    <div className="mount">
      <MarketingTabs active="campaigns" />
      <CampaignsClient
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          isArchived: c.isArchived,
          slug: c.slug,
          senderName: c.sender?.name ?? null,
          currentWave: c.currentWave,
          audienceName: c.audienceView?.name ?? null,
          contentCount: c._count.contentItems,
        }))}
        senders={senders}
      />
    </div>
  );
}
