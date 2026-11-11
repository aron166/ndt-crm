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
import k from "@/components/astryx/page.module.css";
import s from "./marketing.module.css";

const VERDICT_COLOR: Record<Verdict, string> = {
  approve: "var(--ui-success)",
  changes: "var(--ui-warning)",
  rewrite: "var(--ui-danger)",
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
    <div className={s.filterRow}>
      <select className={s.field} value={searchParams.get("category") ?? "all"} onChange={(e) => setFilter("category", e.target.value)}>
        <option value="all">{UI.category}: {UI.all}</option>
        {CONTENT_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABEL[c]}</option>)}
      </select>
      <select className={s.field} value={searchParams.get("campaign") ?? "all"} onChange={(e) => setFilter("campaign", e.target.value)}>
        <option value="all">{UI.campaign}: {UI.all}</option>
        {filterOptions.campaigns.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
      </select>
      <select className={s.field} value={searchParams.get("format") ?? "all"} onChange={(e) => setFilter("format", e.target.value)}>
        <option value="all">{UI.format}: {UI.all}</option>
        {filterOptions.formats.map((f) => <option key={f} value={f}>{f}</option>)}
      </select>
      <select className={s.field} value={searchParams.get("status") ?? "all"} onChange={(e) => setFilter("status", e.target.value)}>
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
    <div className={k.pager}>
      <button
        type="button" className={k.btn}
        disabled={page <= 1} onClick={() => go(page - 1)}
      >
        {UI.pagePrev}
      </button>
      <span className={k.muted}>{UI.pageLabel(page)}</span>
      <button
        type="button" className={k.btn}
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
  const urgency = item.overdue ? "overdue" : item.status === "live" ? "done" : undefined;
  return (
    <div className={k.row} data-u={urgency}>
      <span className={k.bar} />
      <div className={k.cell}>
        <div className={k.nameLine}>
          <Link href={`/marketing/${item.id}`} className={`${k.name} ${s.rowLink}`}>
            {item.title}
          </Link>
        </div>
        <div className={k.meta}>
          <span className={k.muted}>
            {CATEGORY_LABEL[item.category as ContentCategory] ?? item.category}
          </span>
          <StatusChip status={item.status} />
          {item.campaign && (
            <span className={k.muted}>{item.campaign.name}</span>
          )}
          {item.versionNumber !== null && (
            <span className={`${k.muted} ${k.num}`}>
              {UI.version(item.versionNumber)}
            </span>
          )}
          {item.openChecks > 0 && (
            <span className="badge-ds amber">{UI.checksOpen(item.openChecks)}</span>
          )}
          {item.selfScore !== null && (
            <span className="badge-ds" style={{ color: "var(--ui-text-muted)" }}>
              {UI.selfScoreShort(Math.round(item.selfScore * 100))}
            </span>
          )}
        </div>
      </div>
      <div className={k.cell}>
        {item.purpose && (
          <p className={k.muted} style={{ margin: 0 }}>{item.purpose}</p>
        )}
        <div className={k.meta}>
          {item.verdicts.map((v) => (
            <span key={v.reviewerId} className={`${k.muted} ${s.verdict}`}>
              <span
                className={s.dot}
                style={{
                  background: v.verdict ? VERDICT_COLOR[v.verdict as Verdict] : "var(--ui-border-strong)",
                }}
              />
              {v.reviewerName}: {v.verdict ? VERDICT_LABEL[v.verdict as Verdict] : UI.notYetReviewed}
            </span>
          ))}
        </div>
      </div>
      <div className={k.cell}>
        {item.overdue && item.waitingSince && (
          <span className={`${k.strong} ${s.late}`}>
            {UI.waitingDays(daysSince(item.waitingSince))}
          </span>
        )}
      </div>
      <div className={k.cellEnd}>
        {item.status === "archived" && (
          <button
            type="button"
            className={k.btn}
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
        <label className={s.checkHit}>
          <input
            type="checkbox"
            checked={selected}
            onChange={() => onToggle(item.id)}
            aria-label={item.title}
            className={s.check}
          />
        </label>
      </div>
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
    <div className={s.stack}>
      {groups.map(([category, groupItems]) => (
        <div key={category}>
          <div className={k.groupHead}>
            <h3 className={k.groupTitle}>
              {CATEGORY_LABEL[category as ContentCategory] ?? category}
            </h3>
            <span className={`${k.muted} ${k.num}`}>
              {groupItems.length}
            </span>
          </div>
          <div>
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
    <div className={s.sectionHead}>
      <button
        onClick={() => setOpen(!open)}
        className={s.sectionToggle}
      >
        {open ? <ChevronDown className="size-4" style={{ color: "var(--ui-text-muted)" }} /> : <ChevronRight className="size-4" style={{ color: "var(--ui-text-muted)" }} />}
        <h2 className={k.groupTitle}>{title}</h2>
        <span className={`${k.muted} ${k.num}`}>{count}</span>
      </button>
      {ids.length > 0 && (
        <button
          onClick={() => onSelectAll(ids)}
          className={`${k.btn} ${s.selectAll}`}
          aria-pressed={allSelected}
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
        <div className={s.warn}>
          {UI.noReviewers}
        </div>
      )}

      <FilterBar filterOptions={filterOptions} />

      <div className={s.stackLg} style={{ paddingBottom: selected.size > 0 ? 72 : 0 }}>
        {sections.isReviewer ? (
          <section>
            <SectionHeader
              title={UI.mine} count={sections.mine.length} open onSelectAll={selectAll}
              setOpen={() => {}} ids={sections.mine.map((r) => r.id)} selected={selected}
            />
            {sections.mine.length === 0 ? (
              <div className={`${k.empty} ${s.emptyC}`}>{UI.nothingForYou}</div>
            ) : (
              <GroupedByCategory items={sections.mine} selected={selected} onToggle={toggle} />
            )}
          </section>
        ) : (
          <div className={`${k.empty} ${s.emptyC}`}>{UI.notReviewer}</div>
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
