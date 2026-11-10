import type { ReactNode } from "react";
import { PageHeader, Seg } from "@/components/astryx/PageHeader";
import { UI } from "@/lib/content/labels";

const TABS = [
  { key: "inbox" as const, href: "/marketing", label: "Anyagok" },
  { key: "live" as const, href: "/marketing/live", label: "Élő anyagok" },
  { key: "campaigns" as const, href: "/marketing/campaigns", label: "Kampányok" },
  { key: "decisions" as const, href: "/marketing/decisions", label: UI.decisionsTab },
];

type Active = "inbox" | "live" | "campaigns" | "decisions";

export function MarketingTabs({ active }: { active: Active }) {
  // PROPOSAL copy
  return <Seg items={TABS} current={active} label="Marketing" />;
}

/** Page title + the four marketing tabs + the pipeline line, shared by every tab page. */
export function MarketingHeader({
  active, title, eyebrow, help, actions, filters,
}: {
  active: Active;
  title: ReactNode;
  eyebrow?: ReactNode;
  help?: ReactNode;
  actions?: ReactNode;
  filters?: ReactNode;
}) {
  return (
    <PageHeader
      title={title}
      eyebrow={eyebrow}
      help={help ?? UI.pipeline.join(" → ")}
      views={<MarketingTabs active={active} />}
      actions={actions}
      filters={filters}
    />
  );
}
