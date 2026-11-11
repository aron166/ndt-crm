import { redirect } from "next/navigation";
import { outreachStatsHref } from "@/lib/campaigns/labels";

// One campaigns page (Áron 2026-11-11): the dashboard lives in the hub as the Kiküldés view.
export default async function OutreachCampaignsRedirect({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; sender?: string; wave?: string }>;
}) {
  redirect(outreachStatsHref(await searchParams));
}
