import { redirect } from "next/navigation";

// One campaigns page (Áron 2026-11-11): the older segment campaigns list lives in the hub by type.
export default function MarketingCampaignsRedirect() {
  redirect("/campaigns?type=marketing");
}
