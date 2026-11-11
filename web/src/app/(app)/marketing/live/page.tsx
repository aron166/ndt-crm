import { getLibrary, getFilterOptions } from "@/lib/content/queries";
import { MarketingHeader } from "../MarketingTabs";
import { LibraryClient } from "./LibraryClient";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

interface SearchParams {
  category?: string;
  campaign?: string;
  format?: string;
  page?: string;
}

export default async function MarketingLivePage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const params = await searchParams;
  const filter = {
    category: params.category,
    campaignId: params.campaign ? Number(params.campaign) : undefined,
    format: params.format,
    page: params.page ? Number(params.page) : undefined,
  };
  const [library, filterOptions] = await Promise.all([
    getLibrary(TENANT_ID, filter),
    getFilterOptions(TENANT_ID),
  ]);

  return (
    <div className="mount">
      {/* PROPOSAL copy */}
      <MarketingHeader active="live" title="Élő anyagok" />
      <LibraryClient
        rows={library.rows}
        filterOptions={filterOptions}
        page={library.page}
        hasMore={library.hasMore}
      />
    </div>
  );
}
