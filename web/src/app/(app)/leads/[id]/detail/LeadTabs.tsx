"use client";

import Link from "next/link";

export const TAB_KEYS = ["overview", "calls", "offers", "history"] as const;
export type TabKey = (typeof TAB_KEYS)[number];

export function parseTab(v: string | null): TabKey {
  return (TAB_KEYS as readonly string[]).includes(v ?? "") ? (v as TabKey) : "overview";
}

// Tab state lives in the URL (?tab=), so a tab can be deep-linked and Back works.
export function LeadTabs({ active, callCount }: { active: TabKey; callCount: number }) {
  const tabs: { key: TabKey; label: string }[] = [
    { key: "overview", label: "Áttekintés" },
    { key: "calls", label: callCount > 0 ? `Hívások · ${callCount}` : "Hívások" },
    { key: "offers", label: "Ajánlatok és dokumentumok" },
    { key: "history", label: "Előzmények" },
  ];
  return (
    <div role="tablist" className="flex overflow-x-auto" style={{ borderBottom: "1px solid var(--line-soft)", marginBottom: 16, gap: 4 }}>
      {tabs.map((t) => {
        const on = t.key === active;
        return (
          <Link
            key={t.key}
            href={`?tab=${t.key}`}
            scroll={false}
            role="tab"
            aria-selected={on}
            className="inline-flex items-center min-h-[44px] whitespace-nowrap"
            style={{
              padding: "0 14px", fontSize: 14, fontWeight: on ? 600 : 500,
              color: on ? "var(--fg)" : "var(--fg-mute)",
              borderBottom: `2px solid ${on ? "var(--indigo)" : "transparent"}`, marginBottom: -1,
            }}
          >
            {t.label}
          </Link>
        );
      })}
    </div>
  );
}
