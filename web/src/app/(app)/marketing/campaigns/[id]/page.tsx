import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import { getSavedViews } from "@/app/actions/saved-views";
import { audienceWhere, countAudience, listAudience } from "@/lib/marketing/audience-query";
import { AUDIENCE_PREVIEW_LIMIT } from "@/lib/marketing/audience";
import { CampaignDetailClient } from "./CampaignDetailClient";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

export default async function CampaignDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const campaignId = parseInt(id, 10);

  const campaign = await db.campaign.findFirst({
    where: { id: campaignId, tenantId: TENANT_ID },
    include: {
      audienceView: { select: { id: true, name: true, filters: true } },
      contentItems: {
        orderBy: { updatedAt: "desc" },
        select: { id: true, title: true, channel: true, status: true, updatedAt: true },
      },
    },
  });
  if (!campaign) notFound();

  // Resolve the audience segment to a live count + a small preview.
  let audienceCount = 0;
  let preview: Awaited<ReturnType<typeof listAudience>> = [];
  if (campaign.audienceView) {
    const where = await audienceWhere(campaign.audienceView.filters, TENANT_ID);
    [audienceCount, preview] = await Promise.all([
      countAudience(where),
      listAudience(where, AUDIENCE_PREVIEW_LIMIT),
    ]);
  }

  const companyViews = await getSavedViews("company");

  return (
    <CampaignDetailClient
      campaign={{
        id: campaign.id,
        name: campaign.name,
        description: campaign.description,
        isArchived: campaign.isArchived,
        audienceViewId: campaign.audienceView?.id ?? null,
        audienceName: campaign.audienceView?.name ?? null,
      }}
      audience={{
        count: audienceCount,
        previewLimit: AUDIENCE_PREVIEW_LIMIT,
        preview: preview.map((c) => ({
          name: c.name,
          vatNumber: c.vatNumber,
          city: c.city,
          county: c.county,
          pipelineStatus: c.pipelineStatus,
        })),
      }}
      contentItems={campaign.contentItems.map((i) => ({
        id: i.id,
        title: i.title,
        channel: i.channel,
        status: i.status,
        updatedAt: i.updatedAt.toISOString(),
      }))}
      companyViews={companyViews.map((v) => ({ id: v.id, name: v.name }))}
    />
  );
}
