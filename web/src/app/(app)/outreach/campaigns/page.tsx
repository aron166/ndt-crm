import { listCampaignKeys, listSenders, getCampaignStats, getCampaignStepTemplates } from "@/app/actions/outreach-campaigns";
import k from "@/components/astryx/page.module.css";
import s from "../outreach.module.css";
import CampaignDashboard from "./CampaignDashboard";

// Numbers computed from rows on every request — no cached counter to go stale.
export const dynamic = "force-dynamic";

function parseIntOrNull(v: string | undefined): number | null {
  if (!v) return null;
  const n = parseInt(v, 10);
  return Number.isFinite(n) ? n : null;
}

export default async function CampaignsPage({
  searchParams,
}: {
  searchParams: Promise<{ campaign?: string; sender?: string; wave?: string }>;
}) {
  const params = await searchParams;
  const [campaigns, senders] = await Promise.all([listCampaignKeys(), listSenders()]);
  const campaign = params.campaign || campaigns[0];
  const senderUserId = parseIntOrNull(params.sender);
  const wave = parseIntOrNull(params.wave);

  if (!campaign) {
    return (
      <div className={`${k.empty} ${s.emptyC}`}>
        Nincs adat ehhez a kampányhoz.
      </div>
    );
  }

  const [result, stepTemplates] = await Promise.all([
    getCampaignStats({ campaign, senderUserId, wave }),
    getCampaignStepTemplates(campaign),
  ]);
  const stats = result && !("ok" in result) ? result : null;

  return (
    <CampaignDashboard
      campaigns={campaigns}
      senders={senders}
      campaign={campaign ?? ""}
      senderUserId={senderUserId}
      wave={wave}
      stats={stats}
      stepTemplates={stepTemplates}
    />
  );
}
