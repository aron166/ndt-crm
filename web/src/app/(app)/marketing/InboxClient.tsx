"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { ChevronDown, ChevronRight } from "lucide-react";
import { restoreContent } from "@/app/actions/content";
import { UI, CATEGORY_LABEL, VERDICT_LABEL } from "@/lib/content/labels";
import { CONTENT_CATEGORIES, type ContentCategory, type Verdict } from "@/lib/content/types";
import { STATUS_LABELS, statusTone, CONTENT_STATUSES } from "@/lib/marketing/types";
import type { InboxSections, InboxRow } from "@/lib/content/queries";
import { ReviewerSettings } from "./ReviewerSettings";
import { BulkBar } from "./BulkBar";

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

/** Shared by board + list — the category/campaign/format/status filters. */
export function FilterBar({
  filterOptions,
}: {
  filterOptions: { campaigns: { id: number; name: string }[]; formats: string[] };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    params.delete("page"); // a new filter starts on page 1
    router.push(`/marketing?${params.toString()}`);
  }

  return (
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
  );
}

/** Shared by board + list — prev/next over the pipeline page, preserving every other param. */
export function Pager({
  page, hasMore, onNavigate,
}: {
  page: number; hasMore: boolean; onNavigate?: () => void;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  if (page <= 1 && !hasMore) return null;

  function go(next: number) {
    onNavigate?.();
    const params = new URLSearchParams(searchParams.toString());
    params.set("page", String(next));
    router.push(`/marketing?${params.toString()}`);
  }

  return (
    <div className="flex items-center gap-3" style={{ marginTop: 16 }}>
      <button
        type="button" className="btn sm" style={{ minHeight: 44, opacity: page > 1 ? 1 : 0.5 }}
        disabled={page <= 1} onClick={() => go(page - 1)}
      >
        {UI.pagePrev}
      </button>
      <span style={{ fontSize: 13, color: "var(--fg-mute)" }}>{UI.pageLabel(page)}</span>
      <button
        type="button" className="btn sm" style={{ minHeight: 44, opacity: hasMore ? 1 : 0.5 }}
        disabled={!hasMore} onClick={() => go(page + 1)}
      >
        {UI.pageNext}
      </button>
    </div>
  );
}

function StatusChip({ status }: { status: string }) {
  const tone = statusTone(status);
  const label = STATUS_LABELS[status as keyof typeof STATUS_LABELS] ?? status;
  return (
    <span
      className="font-mono-ndt"
      style={{
        fontSize: 12, color: tone.fg, background: tone.bg, border: `1px solid ${tone.line}`,
        borderRadius: 4, padding: "1px 6px",
      }}
    >
      {label}
    </span>
  );
}

function Row({
  item, selected, onToggle,
}: {
  item: InboxRow; selected: boolean; onToggle: (id: number) => void;
}) {
  const router = useRouter();
  const [restoring, setRestoring] = useState(false);
  return (
    <div className="flex items-start gap-2">
      <input
        type="checkbox"
        checked={selected}
        onChange={() => onToggle(item.id)}
        aria-label={item.title}
        style={{ marginTop: 18, width: 18, height: 18, flexShrink: 0 }}
      />
      <Link
        href={`/marketing/${item.id}`}
        className="block"
        style={{
          flex: 1, minWidth: 0,
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
          {item.openChecks > 0 && (
            <span className="badge-ds amber">{UI.checksOpen(item.openChecks)}</span>
          )}
          {item.selfScore !== null && (
            <span className="badge-ds" style={{ color: "var(--fg-mute)" }}>
              {UI.selfScoreShort(Math.round(item.selfScore * 100))}
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
      {item.status === "archived" && (
        <button
          type="button"
          className="btn sm"
          style={{ marginTop: 14, minHeight: 44 }}
          disabled={restoring}
          onClick={async () => {
            setRestoring(true);
            const res = await restoreContent(item.id);
            setRestoring(false);
            if (res.ok) router.refresh();
          }}
        >
          {UI.restore}
        </button>
      )}
    </div>
  );
}

function GroupedByCategory({
  items, selected, onToggle,
}: {
  items: InboxRow[]; selected: Set<number>; onToggle: (id: number) => void;
}) {
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
            {groupItems.map((item) => (
              <Row key={item.id} item={item} selected={selected.has(item.id)} onToggle={onToggle} />
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function SectionHeader({
  title, count, open, setOpen, ids, selected, onSelectAll,
}: {
  title: string; count: number; open: boolean; setOpen: (v: boolean) => void;
  ids: number[]; selected: Set<number>; onSelectAll: (ids: number[]) => void;
}) {
  const allSelected = ids.length > 0 && ids.every((id) => selected.has(id));
  return (
    <div className="flex items-center gap-2" style={{ padding: "6px 0" }}>
      <button
        onClick={() => setOpen(!open)}
        className="flex items-center gap-2"
        style={{ background: "transparent", border: "none", cursor: "pointer", minHeight: 44, textAlign: "left" }}
      >
        {open ? <ChevronDown className="size-4" style={{ color: "var(--fg-faint)" }} /> : <ChevronRight className="size-4" style={{ color: "var(--fg-faint)" }} />}
        <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)" }}>{title}</h2>
        <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>{count}</span>
      </button>
      {ids.length > 0 && (
        <button
          onClick={() => onSelectAll(ids)}
          style={{
            marginLeft: "auto", background: "transparent", border: "none", cursor: "pointer",
            fontSize: 12, color: allSelected ? "var(--indigo)" : "var(--fg-faint)", minHeight: 44, padding: "0 6px",
          }}
        >
          {UI.selectAll}
        </button>
      )}
    </div>
  );
}

function Section({
  title, count, ids, selected, onSelectAll, children, collapsedByDefault = false,
}: {
  title: string; count: number; ids: number[]; selected: Set<number>; onSelectAll: (ids: number[]) => void;
  children: React.ReactNode; collapsedByDefault?: boolean;
}) {
  const [open, setOpen] = useState(!collapsedByDefault);
  return (
    <section>
      <SectionHeader title={title} count={count} open={open} setOpen={setOpen} ids={ids} selected={selected} onSelectAll={onSelectAll} />
      {open && <div style={{ marginTop: 8 }}>{children}</div>}
    </section>
  );
}

export function InboxClient({
  sections,
  filterOptions,
  onlyMine,
}: {
  sections: InboxSections;
  filterOptions: { campaigns: { id: number; name: string }[]; formats: string[] };
  onlyMine: boolean;
}) {
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const router = useRouter();

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAll(ids: number[]) {
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of ids) { if (allSelected) next.delete(id); else next.add(id); }
      return next;
    });
  }

  function afterBulkAction() {
    setSelected(new Set());
    router.refresh();
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

      <FilterBar filterOptions={filterOptions} />

      <div className="space-y-8" style={{ paddingBottom: selected.size > 0 ? 72 : 0 }}>
        {sections.isReviewer ? (
          <section>
            <SectionHeader
              title={UI.mine} count={sections.mine.length} open onSelectAll={selectAll}
              setOpen={() => {}} ids={sections.mine.map((r) => r.id)} selected={selected}
            />
            {sections.mine.length === 0 ? (
              <div className="panel">
                <div className="panel-pad" style={{ textAlign: "center", color: "var(--fg-mute)", fontSize: 14 }}>
                  {UI.nothingForYou}
                </div>
              </div>
            ) : (
              <GroupedByCategory items={sections.mine} selected={selected} onToggle={toggle} />
            )}
          </section>
        ) : (
          <div className="panel">
            <div className="panel-pad" style={{ textAlign: "center", color: "var(--fg-mute)", fontSize: 14 }}>
              {UI.notReviewer}
            </div>
          </div>
        )}

        {!onlyMine && sections.otherReviewer.length > 0 && (
          <Section
            title={UI.otherReviewer} count={sections.otherReviewer.length}
            ids={sections.otherReviewer.map((r) => r.id)} selected={selected} onSelectAll={selectAll}
          >
            <GroupedByCategory items={sections.otherReviewer} selected={selected} onToggle={toggle} />
          </Section>
        )}

        {!onlyMine && sections.changesRequested.length > 0 && (
          <Section
            title={UI.changesRequested} count={sections.changesRequested.length}
            ids={sections.changesRequested.map((r) => r.id)} selected={selected} onSelectAll={selectAll}
          >
            <GroupedByCategory items={sections.changesRequested} selected={selected} onToggle={toggle} />
          </Section>
        )}

        {!onlyMine && sections.aiWorking.length > 0 && (
          <Section
            title={UI.aiWorking} count={sections.aiWorking.length}
            ids={sections.aiWorking.map((r) => r.id)} selected={selected} onSelectAll={selectAll}
          >
            <GroupedByCategory items={sections.aiWorking} selected={selected} onToggle={toggle} />
          </Section>
        )}

        {!onlyMine && sections.live.length > 0 && (
          <Section
            title={UI.live} count={sections.live.length} collapsedByDefault
            ids={sections.live.map((r) => r.id)} selected={selected} onSelectAll={selectAll}
          >
            <GroupedByCategory items={sections.live} selected={selected} onToggle={toggle} />
          </Section>
        )}
      </div>

      <Pager page={sections.page} hasMore={sections.hasMore} onNavigate={() => setSelected(new Set())} />

      <ReviewerSettings />

      <BulkBar selectedIds={[...selected]} onClear={() => setSelected(new Set())} onDone={afterBulkAction} />
    </div>
  );
}
