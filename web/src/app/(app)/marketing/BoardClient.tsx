"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { UI, CATEGORY_LABEL, VERDICT_LABEL } from "@/lib/content/labels";
import type { ContentCategory, Verdict } from "@/lib/content/types";
import type { InboxSections, InboxRow } from "@/lib/content/queries";
import { FilterBar, Pager } from "./InboxClient";
import { BulkBar } from "./BulkBar";

const VERDICT_COLOR: Record<Verdict, string> = {
  approve: "var(--mint)",
  changes: "var(--amber)",
  rewrite: "var(--coral)",
};

function daysSince(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

type ColumnKey = "draft" | "in_review" | "changes" | "ai_working" | "live" | "in_campaign";

const COLUMNS: { key: ColumnKey; label: string; color: string; acceptsDrop: boolean }[] = [
  { key: "draft", label: UI.columnDraft, color: "var(--fg-mute)", acceptsDrop: false },
  { key: "in_review", label: UI.columnInReview, color: "var(--amber)", acceptsDrop: false },
  { key: "changes", label: UI.columnChanges, color: "var(--coral)", acceptsDrop: true },
  { key: "ai_working", label: UI.columnAiWorking, color: "var(--violet)", acceptsDrop: false },
  { key: "live", label: UI.columnLive, color: "var(--mint)", acceptsDrop: false },
  { key: "in_campaign", label: UI.columnInCampaign, color: "var(--fg-faint)", acceptsDrop: false },
];

function columnOf(status: string): ColumnKey {
  if (status === "draft") return "draft";
  if (status === "in_review") return "in_review";
  if (status === "changes_requested" || status === "rewrite_requested") return "changes";
  if (status === "ai_working") return "ai_working";
  if (status === "live") return "live";
  return "draft";
}

function Card({
  item, selected, onToggle, dragging, onDragStart, onDragEnd,
}: {
  item: InboxRow; selected: boolean; onToggle: (id: number) => void;
  dragging: boolean; onDragStart: (id: number) => void; onDragEnd: () => void;
}) {
  return (
    <div
      draggable
      onDragStart={() => onDragStart(item.id)}
      onDragEnd={onDragEnd}
      className="select-none"
      style={{
        background: "var(--bg-panel)", border: "1px solid var(--line-soft)", borderRadius: 8,
        padding: "10px 12px", opacity: dragging ? 0.4 : 1, cursor: "grab",
      }}
    >
      <div className="flex items-start gap-2">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggle(item.id)}
          aria-label={item.title}
          style={{ marginTop: 2, width: 18, height: 18, flexShrink: 0 }}
        />
        <Link href={`/marketing/${item.id}`} style={{ flex: 1, minWidth: 0, textDecoration: "none" }}>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
            <span style={{ fontSize: 11, color: "var(--fg-faint)", textTransform: "uppercase", letterSpacing: "0.04em" }}>
              {CATEGORY_LABEL[item.category as ContentCategory] ?? item.category}
            </span>
            {item.format && <span className="badge-ds slate">{item.format}</span>}
            {item.openChecks > 0 && <span className="badge-ds amber">{UI.checksOpen(item.openChecks)}</span>}
            {item.selfScore !== null && (
              <span className="badge-ds" style={{ color: "var(--fg-mute)" }}>
                {UI.selfScoreShort(Math.round(item.selfScore * 100))}
              </span>
            )}
          </div>
          <div style={{ fontSize: 14, fontWeight: 500, color: "var(--fg)", marginBottom: 6, lineHeight: 1.3 }}>
            {item.title}
          </div>
          <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 4 }}>
            {item.verdicts.map((v) => (
              <span key={v.reviewerId} className="flex items-center gap-1" style={{ fontSize: 11, color: "var(--fg-mute)" }}>
                <span
                  style={{
                    width: 7, height: 7, borderRadius: "50%",
                    background: v.verdict ? VERDICT_COLOR[v.verdict as Verdict] : "var(--line-soft)",
                  }}
                />
                {v.reviewerName}: {v.verdict ? VERDICT_LABEL[v.verdict as Verdict] : UI.notYetReviewed}
              </span>
            ))}
          </div>
          {item.overdue && item.waitingSince && (
            <span style={{ fontSize: 11, color: "var(--coral)", fontWeight: 500 }}>
              {UI.waitingDays(daysSince(item.waitingSince))}
            </span>
          )}
        </Link>
      </div>
    </div>
  );
}

export function BoardClient({
  sections, filterOptions, onlyMine,
}: {
  sections: InboxSections;
  filterOptions: { campaigns: { id: number; name: string }[]; formats: string[] };
  onlyMine: boolean;
}) {
  const router = useRouter();
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [draggingId, setDraggingId] = useState<number | null>(null);
  const [hoverCol, setHoverCol] = useState<ColumnKey | null>(null);
  const [note, setNote] = useState<string | null>(null);

  const mineIds = useMemo(() => new Set(sections.mine.map((r) => r.id)), [sections.mine]);
  const allRows = useMemo(() => {
    const seen = new Map<number, InboxRow>();
    for (const r of [...sections.mine, ...sections.otherReviewer, ...sections.aiWorking, ...sections.changesRequested, ...sections.live]) {
      seen.set(r.id, r);
    }
    return [...seen.values()];
  }, [sections]);

  const rows = onlyMine ? allRows.filter((r) => mineIds.has(r.id)) : allRows;
  const byColumn = useMemo(() => {
    const map = new Map<ColumnKey, InboxRow[]>(COLUMNS.map((c) => [c.key, []]));
    for (const r of rows) map.get(columnOf(r.status))!.push(r);
    return map;
  }, [rows]);

  function toggle(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  function selectAllIn(col: ColumnKey) {
    const ids = (byColumn.get(col) ?? []).map((r) => r.id);
    setSelected((prev) => {
      const allSelected = ids.every((id) => prev.has(id));
      const next = new Set(prev);
      for (const id of ids) { if (allSelected) next.delete(id); else next.add(id); }
      return next;
    });
  }

  function handleDrop(col: (typeof COLUMNS)[number]) {
    const id = draggingId;
    setDraggingId(null);
    setHoverCol(null);
    if (id == null) return;
    if (!col.acceptsDrop) {
      setNote(UI.dragNotAllowed);
      setTimeout(() => setNote(null), 3000);
      return;
    }
    // The only legal drop: send the reviewer to write the required comment.
    router.push(`/marketing/${id}?verdict=changes`);
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

      {note && (
        <div
          className="panel-pad"
          style={{
            background: "var(--coral-soft)", border: "1px solid var(--coral)", borderRadius: 8,
            marginBottom: 12, color: "var(--coral)", fontSize: 13, fontWeight: 500,
          }}
        >
          {note}
        </div>
      )}

      <div className="kboard" style={{ gridAutoColumns: 280, paddingBottom: selected.size > 0 ? 72 : 8 }}>
        {COLUMNS.map((col) => {
          const cards = byColumn.get(col.key) ?? [];
          const isHover = hoverCol === col.key;
          const isMuted = col.key === "in_campaign";
          return (
            <div
              key={col.key}
              className="kcol"
              style={{
                background: isHover && col.acceptsDrop ? `${col.color}10` : "oklch(0.18 0.014 255 / 0.5)",
                border: `1px solid ${isHover && col.acceptsDrop ? col.color : "var(--line-soft)"}`,
                width: 280, flexShrink: 0,
                opacity: isMuted ? 0.55 : 1,
              }}
              onDragOver={(e) => { if (draggingId != null) { e.preventDefault(); setHoverCol(col.key); } }}
              onDragLeave={() => setHoverCol((p) => (p === col.key ? null : p))}
              onDrop={() => handleDrop(col)}
            >
              <div className="kcol-head">
                <span className="kcol-dot" style={{ background: col.color }} />
                <span className="kcol-title">{col.label}</span>
                <span className="kcol-count">{cards.length}</span>
              </div>
              <div className="kcol-body">
                {cards.length > 0 && (
                  <button
                    onClick={() => selectAllIn(col.key)}
                    style={{
                      alignSelf: "flex-start", background: "transparent", border: "none", cursor: "pointer",
                      fontSize: 11, color: "var(--fg-faint)", padding: "2px 0", minHeight: 22,
                    }}
                  >
                    {UI.selectAll}
                  </button>
                )}
                {cards.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--fg-faint)", padding: "8px 2px" }}>{UI.emptyColumn}</div>
                ) : (
                  cards.map((item) => (
                    <Card
                      key={item.id}
                      item={item}
                      selected={selected.has(item.id)}
                      onToggle={toggle}
                      dragging={draggingId === item.id}
                      onDragStart={setDraggingId}
                      onDragEnd={() => { setDraggingId(null); setHoverCol(null); }}
                    />
                  ))
                )}
              </div>
            </div>
          );
        })}
      </div>

      <Pager page={sections.page} hasMore={sections.hasMore} onNavigate={() => setSelected(new Set())} />

      <BulkBar
        selectedIds={[...selected]}
        onClear={() => setSelected(new Set())}
        onDone={() => { setSelected(new Set()); router.refresh(); }}
      />
    </div>
  );
}
