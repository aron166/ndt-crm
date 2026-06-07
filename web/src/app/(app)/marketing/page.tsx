import { db } from "@/lib/db";
import { MarketingQueueClient } from "./MarketingQueueClient";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

export default async function MarketingPage() {
  const [items, campaigns] = await Promise.all([
    db.contentItem.findMany({
      where: { tenantId: TENANT_ID },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true, title: true, body: true, channel: true, contentType: true,
        status: true, internal: true, source: true, externalUrl: true,
        createdAt: true, updatedAt: true,
        campaign: { select: { id: true, name: true } },
      },
    }),
    db.campaign.findMany({
      where: { tenantId: TENANT_ID, isArchived: false },
      orderBy: { name: "asc" },
      select: { id: true, name: true },
    }),
  ]);

  const serialized = items.map((i) => ({
    id: i.id,
    title: i.title,
    excerpt: i.body.slice(0, 160),
    channel: i.channel,
    contentType: i.contentType,
    status: i.status,
    internal: i.internal,
    source: i.source,
    externalUrl: i.externalUrl,
    campaignId: i.campaign?.id ?? null,
    campaignName: i.campaign?.name ?? null,
    createdAt: i.createdAt.toISOString(),
    updatedAt: i.updatedAt.toISOString(),
  }));

  return <MarketingQueueClient items={serialized} campaigns={campaigns} />;
}
