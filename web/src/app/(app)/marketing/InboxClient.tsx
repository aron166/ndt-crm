"use client";

import { useMemo } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { useState } from "react";
import { UI, CATEGORY_LABEL, VERDICT_LABEL } from "@/lib/content/labels";
import { CONTENT_CATEGORIES, type ContentCategory, type Verdict } from "@/lib/content/types";
import { STATUS_LABELS, STATUS_COLORS, CONTENT_STATUSES } from "@/lib/marketing/types";
import type { InboxSections, InboxRow } from "@/lib/content/queries";
import { ReviewerSettings } from "./ReviewerSettings";

const selectStyle: React.CSSProperties = {
  padding: "6px 10px", fontSize: 14, minHeight: 44, maxWidth: "100%",
  background: "var(--bg-raised)", border: "1px solid var(--line-soft)",
  borderRadius: 6, color: "var(--fg)", outline: "none",
};

const VERDICT_COLOR: Record<Verdict, string> = {
  approve: "var(--mint)",
  changes: "var(--amber)",
  rewrite: "var(--coral)",
};

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

function StatusChip({ status }: { status: string }) {
  const color = STATUS_COLORS[status as keyof typeof STATUS_COLORS] ?? "#64748b";
  const label = STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
  return (
    <span
      className="font-mono-ndt"
      style={{
        fontSize: 12, color, background: `${color}1a`, border: `1px solid ${color}40`,
        borderRadius: 4, padding: "1px 6px",
      }}
    >
      {label}
    </span>
  );
}

function Row({ item }: { item: InboxRow }) {
  return (
    <Link
      href={`/marketing/${item.id}`}
      className="block"
      style={{
        background: "var(--bg-raised)", border: "1px solid var(--line-soft)",
        borderRadius: 8, padding: "14px 16px", textDecoration: "none",
        minHeight: 44,
      }}
    >
      <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
        <span style={{ fontSize: 12, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
          {CATEGORY_LABEL[item.category as ContentCategory] ?? item.category}
        </span>
        <StatusChip status={item.status} />
        {item.campaign && (
          <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>{item.campaign.name}</span>
        )}
        {item.versionNumber !== null && (
          <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>
            {UI.version(item.versionNumber)}
          </span>
        )}
        {item.overdue && item.waitingSince && (
          <span
            style={{
              fontSize: 12, color: "var(--coral)", background: "var(--coral-soft)",
              borderRadius: 20, padding: "1px 8px", fontWeight: 500,
            }}
          >
            {UI.waitingDays(daysSince(item.waitingSince))}
          </span>
        )}
      </div>
      <div style={{ fontSize: 15, fontWeight: 500, color: "var(--fg)", marginBottom: 3 }}>
        {item.title}
      </div>
      {item.purpose && (
        <p style={{ fontSize: 13, color: "var(--fg-mute)", marginBottom: 8 }}>{item.purpose}</p>
      )}
      <div className="flex items-center gap-3 flex-wrap">
        {item.verdicts.map((v) => (
          <span key={v.reviewerId} className="flex items-center gap-1.5" style={{ fontSize: 12, color: "var(--fg-mute)" }}>
            <span
              style={{
                width: 8, height: 8, borderRadius: "50%",
                background: v.verdict ? VERDICT_COLOR[v.verdict as Verdict] : "var(--line-soft)",
              }}
            />
            {v.reviewerName}: {v.verdict ? VERDICT_LABEL[v.verdict as Verdict] : UI.notYetReviewed}
          </span>
        ))}
      </div>
    </Link>
  );
}

function GroupedByCategory({ items }: { items: InboxRow[] }) {
  const groups = useMemo(() => {
    const map = new Map<string, InboxRow[]>();
    for (const item of items) {
      const list = map.get(item.category) ?? [];
      list.push(item);
      map.set(item.category, list);
    }
    return [...map.entries()];
  }, [items]);

  return (
    <div className="space-y-5">
      {groups.map(([category, groupItems]) => (
        <div key={category}>
          <div className="flex items-center gap-2" style={{ marginBottom: 8 }}>
            <h3 style={{ fontSize: 13, fontWeight: 600, color: "var(--fg-soft)" }}>
              {CATEGORY_LABEL[category as ContentCategory] ?? category}
            </h3>
            <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>
              {groupItems.length}
            </span>
          </div>
          <div className="space-y-2">
            {groupItems.map((item) => <Row key={item.id} item={item} />)}
          </div>
        </div>
      ))}
    </div>
  );
}

function Section({
  title, count, children, collapsedByDefault = false,
}: {
  title: string; count: number; children: React.ReactNode; collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  return (
    <section>
      <button
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-2 w-full"
        style={{ background: "transparent", border: "none", cursor: "pointer", padding: "6px 0", minHeight: 44, textAlign: "left" }}
      >
        {open ? <ChevronDown className="size-4" style={{ color: "var(--fg-faint)" }} /> : <ChevronRight className="size-4" style={{ color: "var(--fg-faint)" }} />}
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{title}</h2>
        <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>{count}</span>
      </button>
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </section>
  );
}

export function InboxClient({
  sections,
  filterOptions,
}: {
  sections: InboxSections;
  filterOptions: { campaigns: { id: number; name: string }[]; formats: string[] };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    router.push(`/marketing?${params.toString()}`);
  }

  return (
    <div className="mount">
      {sections.reviewers.length < 2 && (
        <div
          className="panel-pad"
          style={{
            background: "var(--coral-soft)", border: "1px solid var(--coral)",
            borderRadius: 8, marginBottom: 16, color: "var(--coral)", fontSize: 14, fontWeight: 500,
          }}
        >
          {UI.noReviewers}
        </div>
      )}

      <div className="flex gap-2 flex-wrap" style={{ marginBottom: 20 }}>
        <select style={selectStyle} value={searchParams.get("category") ?? "all"} onChange={(e) => setFilter("category", e.target.value)}>
          <option value="all">{UI.category}: {UI.all}</option>
          {CONTENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
        </select>
        <select style={selectStyle} value={searchParams.get("campaign") ?? "all"} onChange={(e) => setFilter("campaign", e.target.value)}>
          <option value="all">{UI.campaign}: {UI.all}</option>
          {filterOptions.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
        </select>
        <select style={selectStyle} value={searchParams.get("format") ?? "all"} onChange={(e) => setFilter("format", e.target.value)}>
          <option value="all">{UI.format}: {UI.all}</option>
          {filterOptions.formats.map((f) => <option key={f} value={f}>{f}</option>)}
        </select>
        <select style={selectStyle} value={searchParams.get("status") ?? "all"} onChange={(e) => setFilter("status", e.target.value)}>
          <option value="all">{UI.status}: {UI.all}</option>
          {CONTENT_STATUSES.filter((s) => s !== "archived").map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
        </select>
      </div>

      <div className="space-y-8">
        {sections.isReviewer ? (
          <section>
            <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", marginBottom: 10 }}>{UI.mine}</h2>
            {sections.mine.length === 0 ? (
              <div className="panel">
                <div className="panel-pad" style={{ textAlign: "center", color: "var(--fg-mute)", fontSize: 14 }}>
                  {UI.nothingForYou}
                </div>
              </div>
            ) : (
              <GroupedByCategory items={sections.mine} />
            )}
          </section>
        ) : (
          <div className="panel">
            <div className="panel-pad" style={{ textAlign: "center", color: "var(--fg-mute)", fontSize: 14 }}>
              {UI.notReviewer}
            </div>
          </div>
        )}

        {sections.otherReviewer.length > 0 && (
          <Section title={UI.otherReviewer} count={sections.otherReviewer.length}>
            <GroupedByCategory items={sections.otherReviewer} />
          </Section>
        )}

        {sections.changesRequested.length > 0 && (
          <Section title={UI.changesRequested} count={sections.changesRequested.length}>
            <GroupedByCategory items={sections.changesRequested} />
          </Section>
        )}

        {sections.aiWorking.length > 0 && (
          <Section title={UI.aiWorking} count={sections.aiWorking.length}>
            <GroupedByCategory items={sections.aiWorking} />
          </Section>
        )}

        {sections.live.length > 0 && (
          <Section title={UI.live} count={sections.live.length} collapsedByDefault>
            <GroupedByCategory items={sections.live} />
          </Section>
        )}
      </div>

      <ReviewerSettings />
    </div>
  );
}
