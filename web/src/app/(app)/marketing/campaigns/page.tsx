import { db } from "@/lib/db";
import { MarketingTabs } from "../MarketingTabs";
import { CampaignsClient } from "./CampaignsClient";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

export default async function CampaignsPage() {
  const campaigns = await db.campaign.findMany({
    where: { tenantId: TENANT_ID },
    orderBy: [{ isArchived: "asc" }, { name: "asc" }],
    select: {
      id: true, name: true, description: true, isArchived: true,
      audienceView: { select: { id: true, name: true } },
      _count: { select: { contentItems: true } },
    },
  });

  return (
    <div className="mount">
      <MarketingTabs active="campaigns" />
      <CampaignsClient
        campaigns={campaigns.map((c) => ({
          id: c.id,
          name: c.name,
          description: c.description,
          isArchived: c.isArchived,
          audienceName: c.audienceView?.name ?? null,
          contentCount: c._count.contentItems,
        }))}
      />
    </div>
  );
}
