import { db } from "@/lib/db";
import { audienceWhere, listAudience, countAudience } from "@/lib/marketing/audience-query";
import { companiesToCsv, audienceFileName, MAX_EXPORT_ROWS } from "@/lib/marketing/audience";

const TENANT_ID = 1;

/**
 * GET /marketing/campaigns/[id]/export — download the campaign's audience as CSV.
 * Resolves the SAME segment the detail page previews, but the full list.
 * Auth: gated by proxy.ts like every (app) route.
 */
export async function GET(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  if (!/^\d+$/.test(id)) {
    return new Response("Not found", { status: 404 });
  }

  const campaign = await db.campaign.findFirst({
    where: { id: parseInt(id, 10), tenantId: TENANT_ID },
    include: { audienceView: { select: { filters: true } } },
  });
  if (!campaign) return new Response("Not found", { status: 404 });
  if (!campaign.audienceView) {
    return new Response("A kampánynak nincs célközönsége", { status: 400 });
  }

  const where = await audienceWhere(campaign.audienceView.filters, TENANT_ID);

  // Bound memory: refuse (don't silently truncate) a pathologically large export.
  const total = await countAudience(where);
  if (total > MAX_EXPORT_ROWS) {
    return new Response(
      `A célközönség túl nagy az exporthoz (${total} cég, max ${MAX_EXPORT_ROWS}). Szűkítsd a szegmenst.`,
      { status: 413 },
    );
  }

  const rows = await listAudience(where, MAX_EXPORT_ROWS);
  // Lead with a UTF-8 BOM so Excel reads Hungarian accents correctly.
  const csv = "﻿" + companiesToCsv(rows);

  return new Response(csv, {
    status: 200,
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename="${audienceFileName(campaign.name)}"`,
      "Cache-Control": "no-store",
    },
  });
}
