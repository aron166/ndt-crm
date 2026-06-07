import { db } from "@/lib/db";
import { notFound } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getEntityHistory } from "@/app/actions/audit";
import { serializeDates } from "@/lib/serialize";
import { MarketingDetailClient } from "./MarketingDetailClient";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

export default async function ContentDetailPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) notFound();
  const itemId = parseInt(id, 10);

  const item = await db.contentItem.findFirst({
    where: { id: itemId, tenantId: TENANT_ID },
    include: {
      campaign: { select: { id: true, name: true } },
      assets: { orderBy: { position: "asc" } },
    },
  });
  if (!item) notFound();

  const auditEntries = await getEntityHistory("content_item", itemId);

  const metrics = (item.metrics ?? null) as Record<string, number> | null;

  return (
    <div className="mount">
      <div style={{ marginBottom: 16 }}>
        <Link
          href="/marketing"
          style={{ display: "inline-flex", alignItems: "center", gap: 6, fontSize: 13, color: "var(--fg-mute)" }}
          className="row-link"
        >
          <ArrowLeft style={{ width: 14, height: 14 }} />
          Vissza a sorhoz
        </Link>
      </div>

      <MarketingDetailClient
        item={{
          id: item.id,
          title: item.title,
          body: item.body,
          channel: item.channel,
          contentType: item.contentType,
          status: item.status,
          internal: item.internal,
          source: item.source,
          externalUrl: item.externalUrl,
          reviewNote: item.reviewNote,
          campaignName: item.campaign?.name ?? null,
          metrics,
          createdAt: item.createdAt.toISOString(),
          updatedAt: item.updatedAt.toISOString(),
        }}
        assets={item.assets.map((a) => ({
          id: a.id, kind: a.kind, url: a.url, caption: a.caption,
        }))}
        auditEntries={serializeDates(auditEntries)}
      />
    </div>
  );
}
