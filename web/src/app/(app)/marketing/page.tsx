import Link from "next/link";
import { LayoutGrid, List } from "lucide-react";
import { getActor } from "@/lib/actor";
import { getInbox, getFilterOptions } from "@/lib/content/queries";
import { UI } from "@/lib/content/labels";
import { MarketingTabs } from "./MarketingTabs";
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
        <MarketingTabs active="inbox" />
        <div className="panel">
          <div className="panel-pad" style={{ textAlign: "center", color: "var(--fg-mute)", fontSize: 14 }}>
            {UI.notReviewer}
          </div>
        </div>
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

  const segStyle = (active: boolean): React.CSSProperties => ({
    display: "flex", alignItems: "center", gap: 6,
    height: 32, padding: "0 12px", fontSize: 13, fontWeight: 500,
    borderRadius: 6, textDecoration: "none",
    color: active ? "var(--fg)" : "var(--fg-mute)",
    background: active ? "var(--bg-hover)" : "transparent",
  });

  return (
    <div className="mount">
      <RefreshOnFocus />
      <MarketingTabs active="inbox" />

      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 16 }}>
        <div
          className="flex items-center gap-1"
          style={{ padding: 3, background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 8 }}
        >
          <Link href={hrefWith({ view: "board" })} style={segStyle(view === "board")}>
            <LayoutGrid style={{ width: 14, height: 14 }} />
            {UI.boardView}
          </Link>
          <Link href={hrefWith({ view: "list" })} style={segStyle(view === "list")}>
            <List style={{ width: 14, height: 14 }} />
            {UI.listView}
          </Link>
        </div>

        <Link
          href={hrefWith({ mine: onlyMine ? "0" : "1" })}
          className="badge-ds dot"
          style={{
            height: 32, cursor: "pointer", textDecoration: "none",
            color: onlyMine ? "var(--indigo)" : "var(--fg-mute)",
            background: onlyMine ? "var(--indigo-soft)" : "var(--bg-raised)",
            borderColor: onlyMine ? "var(--indigo-line)" : "var(--line-soft)",
          }}
        >
          {UI.onlyMine}
        </Link>
      </div>

      {view === "board" ? (
        <BoardClient sections={sections} filterOptions={filterOptions} onlyMine={onlyMine} />
      ) : (
        <InboxClient sections={sections} filterOptions={filterOptions} onlyMine={onlyMine} />
      )}
    </div>
  );
}
