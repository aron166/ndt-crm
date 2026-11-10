"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { Paperclip } from "lucide-react";
import { useRouter, useSearchParams } from "next/navigation";
import { UI, CATEGORY_LABEL } from "@/lib/content/labels";
import { CONTENT_CATEGORIES, type ContentCategory } from "@/lib/content/types";
import type { LibraryRow } from "@/lib/content/queries";
import k from "@/components/astryx/page.module.css";
import s from "../marketing.module.css";

function plainTextPreview(body: string): string {
  const plain = body
    .replace(/```[\s\S]*?```/g, "")
    .replace(/`([^`]+)`/g, "$1")
    .replace(/!\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/\[([^\]]*)\]\([^)]+\)/g, "$1")
    .replace(/[#>*_~-]/g, "")
    .replace(/\s+/g, " ")
    .trim();
  return plain.slice(0, 400);
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      onClick={async (e) => {
        e.preventDefault();
        e.stopPropagation();
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className={k.btn}
    >
      {copied ? UI.copied : UI.copyText}
    </button>
  );
}

function Card({ row }: { row: LibraryRow }) {
  return (
    <div className={k.row} data-u="done" style={{ alignItems: "start" }}>
      <span className={k.bar} />
      <div className={k.cell}>
        <Link href={`/marketing/${row.id}`} className={k.name}>{row.title}</Link>
        <div className={k.meta}>
          {row.campaign && <span className={k.muted}>{row.campaign.name}</span>}
          <span className={`${k.muted} ${k.num}`}>{UI.version(row.versionNumber)}</span>
        </div>
        {row.purpose && <p className={k.muted} style={{ margin: 0 }}>{row.purpose}</p>}
      </div>
      <div className={k.cell}>
        <p className={s.preview}>
          {plainTextPreview(row.body)}
        </p>
      </div>
      <div className={k.cell}>
        {row.assets.length > 0 && (
          // Performance golden rule (spec §6c): a LIST never loads media. The
          // files are counted here and open with the item.
          <div className={`${k.muted} ${s.iconText}`}>
            <Paperclip size={14} aria-hidden="true" />
            {row.assets.length} fájl
          </div>
        )}
        {row.usedBy.length > 0 && (
          <div className={k.meta}>
            {row.usedBy.map((u) => (
              <span key={u} className="badge-ds slate">
                {u}
              </span>
            ))}
          </div>
        )}
      </div>
      <div className={k.cellEnd}>
        <CopyButton text={row.body} />
        <Link href={`/marketing/${row.id}`} className={k.btn}>
          {UI.version(row.versionNumber)} →
        </Link>
      </div>
    </div>
  );
}

export function LibraryClient({
  rows, filterOptions, page, hasMore,
}: {
  rows: LibraryRow[];
  page: number;
  hasMore: boolean;
  filterOptions: { campaigns: { id: number; name: string }[]; formats: string[] };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
    if (key !== "page") params.delete("page"); // a new filter starts on page 1
    router.push(`/marketing/live?${params.toString()}`);
  }

  const groups = useMemo(() => {
    const map = new Map<string, LibraryRow[]>();
    for (const row of rows) {
      const list = map.get(row.category) ?? [];
      list.push(row);
      map.set(row.category, list);
    }
    return [...map.entries()];
  }, [rows]);

  return (
    <div>
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
      </div>

      {rows.length === 0 ? (
        <div className={`${k.empty} ${s.emptyC}`}>{UI.noLiveMatch}</div>
      ) : (
        <div className={s.stackLg}>
          {groups.map(([category, items]) => (
            <section key={category}>
              <div className={k.groupHead}>
                <h2 className={k.groupTitle}>{CATEGORY_LABEL[category as ContentCategory] ?? category}</h2>
                <span className={`${k.muted} ${k.num}`}>{items.length}</span>
              </div>
              <div>
                {items.map((row) => <Card key={row.id} row={row} />)}
              </div>
            </section>
          ))}
        </div>
      )}
      {(page > 1 || hasMore) && (
        <div className={k.pager}>
          <button
            type="button"
            className={k.btn}
            disabled={page <= 1}
            onClick={() => setFilter("page", String(page - 1))}
          >
            {UI.pagePrev}
          </button>
          <span className={k.muted}>{UI.pageLabel(page)}</span>
          <button
            type="button"
            className={k.btn}
            disabled={!hasMore}
            onClick={() => setFilter("page", String(page + 1))}
          >
            {UI.pageNext}
          </button>
        </div>
      )}
    </div>
  );
}
