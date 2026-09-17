import { getLibrary, getFilterOptions } from "@/lib/content/queries";
import { signedViewUrls } from "@/lib/content/storage";
import { MarketingTabs } from "../MarketingTabs";
import { LibraryClient } from "./LibraryClient";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

interface SearchParams {
  category?: string;
  campaign?: string;
  format?: string;
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
  };
  const [rows, filterOptions] = await Promise.all([
    getLibrary(TENANT_ID, filter),
    getFilterOptions(TENANT_ID),
  ]);

  const paths = rows.flatMap((r) => r.assets.map((a) => a.storagePath).filter((p): p is string => Boolean(p)));
  const urls = await signedViewUrls(paths);

  return (
    <div className="mount">
      <MarketingTabs active="live" />
      <LibraryClient rows={rows} signedUrls={urls} filterOptions={filterOptions} />
    </div>
  );
}
