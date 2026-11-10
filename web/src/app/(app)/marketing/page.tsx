import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import { getActor } from "@/lib/actor";
import { getInbox, getFilterOptions } from "@/lib/content/queries";
import { UI } from "@/lib/content/labels";
import { MarketingHeader } from "./MarketingTabs";
import k from "@/components/astryx/page.module.css";
import s from "./marketing.module.css";
import { InboxClient } from "./InboxClient";
import { BoardClient } from "./BoardClient";
import { RefreshOnFocus } from "@/components/RefreshOnFocus";

const TENANT_ID = 1;

export const dynamic = "force-dynamic";

interface SearchParams {
  category?: string;
  campaign?: string;
  format?: string;
  status?: string;
  view?: string;
  mine?: string;
  page?: string;
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
        <MarketingHeader active="inbox" title="Anyagok" />
        <div className={`${k.empty} ${s.emptyC}`}>{UI.notReviewer}</div>
      </div>
    );
  }

  const pageNum = Number(params.page);
  const page = Number.isInteger(pageNum) && pageNum > 0 ? pageNum : 1;

  const filter = {
    category: params.category,
    campaignId: params.campaign ? Number(params.campaign) : undefined,
    format: params.format,
    status: params.status,
    page,
  };
  const view = params.view === "list" ? "list" : "board";
  const onlyMine = params.mine !== "0";

  const [sections, filterOptions] = await Promise.all([
    getInbox(TENANT_ID, userId, filter),
    getFilterOptions(TENANT_ID),
  ]);

  // Preserve the existing filters when flipping view/onlyMine.
  function hrefWith(overrides: Record<string, string>) {
    const qs = new URLSearchParams();
    if (params.category) qs.set("category", params.category);
    if (params.campaign) qs.set("campaign", params.campaign);
    if (params.format) qs.set("format", params.format);
    if (params.status) qs.set("status", params.status);
    qs.set("view", view);
    qs.set("mine", onlyMine ? "1" : "0");
    for (const [k, v] of Object.entries(overrides)) qs.set(k, v);
    return `/marketing?${qs.toString()}`;
  }

  return (
    <div className="mount">
      <RefreshOnFocus />
      <MarketingHeader
        active="inbox"
        title="Anyagok"
        filters={
          <>
            <nav className={k.seg} aria-label="Nézet">
              <Link
                href={hrefWith({ view: "board" })}
                aria-current={view === "board" ? "page" : undefined}
                className={`${k.segItem} ${view === "board" ? k.segItemOn : ""}`}
              >
                <LayoutGrid style={{ width: 14, height: 14, marginRight: 6 }} />
                {UI.boardView}
              </Link>
              <Link
                href={hrefWith({ view: "list" })}
                aria-current={view === "list" ? "page" : undefined}
                className={`${k.segItem} ${view === "list" ? k.segItemOn : ""}`}
              >
                <List style={{ width: 14, height: 14, marginRight: 6 }} />
                {UI.listView}
              </Link>
            </nav>
            <Link
              href={hrefWith({ mine: onlyMine ? "0" : "1" })}
              aria-current={onlyMine ? "true" : undefined}
              className={`${k.btn} ${onlyMine ? s.toggleOn : ""}`}
            >
              {UI.onlyMine}
            </Link>
          </>
        }
      />

      {view === "board" ? (
        <BoardClient sections={sections} filterOptions={filterOptions} onlyMine={onlyMine} />
      ) : (
        <InboxClient sections={sections} filterOptions={filterOptions} onlyMine={onlyMine} />
      )}
    </div>
  );
}
