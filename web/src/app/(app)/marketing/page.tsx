import { getActor } from "@/lib/actor";
import { getInbox, getFilterOptions } from "@/lib/content/queries";
import { UI } from "@/lib/content/labels";
import { MarketingTabs } from "./MarketingTabs";
import { InboxClient } from "./InboxClient";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

interface SearchParams {
  category?: string;
  campaign?: string;
  format?: string;
  status?: string;
}

export default async function MarketingPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const { userId } = await getActor(TENANT_ID);

  if (userId == null) {
    return (
      <div className="mount">
        <MarketingTabs active="inbox" />
        <div className="panel">
          <div className="panel-pad" style={{ textAlign: "center", color: "var(--fg-mute)", fontSize: 14 }}>
            {UI.notReviewer}
          </div>
        </div>
      </div>
    );
  }

  const filter = {
    category: params.category,
    campaignId: params.campaign ? Number(params.campaign) : undefined,
    format: params.format,
    status: params.status,
  };

  const [sections, filterOptions] = await Promise.all([
    getInbox(TENANT_ID, userId, filter),
    getFilterOptions(TENANT_ID),
  ]);

  return (
    <div className="mount">
      <MarketingTabs active="inbox" />
      <InboxClient sections={sections} filterOptions={filterOptions} />
    </div>
  );
}
