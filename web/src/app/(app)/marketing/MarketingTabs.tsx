import Link from "next/link";
import { UI } from "@/lib/content/labels";

const TABS = [
  { key: "inbox" as const, href: "/marketing", label: "Anyagok" },
  { key: "live" as const, href: "/marketing/live", label: "Élő anyagok" },
  { key: "campaigns" as const, href: "/marketing/campaigns", label: "Kampányok" },
];

export function MarketingTabs({ active }: { active: "inbox" | "live" | "campaigns" }) {
  return (
    <div style={{ marginBottom: 18, maxWidth: "100%", overflow: "hidden" }}>
      <div
        className="flex gap-1"
        style={{ overflowX: "auto", maxWidth: "100%", minWidth: 0, borderBottom: "1px solid var(--line-soft)" }}
      >
        {TABS.map((t) => {
          const isActive = t.key === active;
          return (
            <Link
              key={t.key}
              href={t.href}
              className="whitespace-nowrap"
              style={{
                display: "flex", alignItems: "center",
                padding: "0 14px", height: 44,
                fontSize: 14, fontWeight: 500,
                color: isActive ? "var(--fg)" : "var(--fg-mute)",
                borderBottom: isActive ? "2px solid var(--indigo)" : "2px solid transparent",
                marginBottom: -1,
                textDecoration: "none",
              }}
            >
              {t.label}
            </Link>
          );
        })}
      </div>
      <p style={{ fontSize: 12, color: "var(--fg-faint)", marginTop: 8 }}>
        {UI.pipeline.join(" → ")}
      </p>
    </div>
  );
}
