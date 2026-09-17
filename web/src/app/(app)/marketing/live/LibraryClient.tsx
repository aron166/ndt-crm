"use client";

import { useMemo, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { UI, CATEGORY_LABEL } from "@/lib/content/labels";
import { CONTENT_CATEGORIES, type ContentCategory } from "@/lib/content/types";
import type { LibraryRow } from "@/lib/content/queries";

const selectStyle: React.CSSProperties = {
  padding: "6px 10px", fontSize: 14, minHeight: 44, maxWidth: "100%",
  background: "var(--bg-raised)", border: "1px solid var(--line-soft)",
  borderRadius: 6, color: "var(--fg)", outline: "none",
};

function isHttpUrl(u: string): boolean {
  try {
    const p = new URL(u);
    return p.protocol === "http:" || p.protocol === "https:";
  } catch {
    return false;
  }
}

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
      className="btn sm"
      style={{ minHeight: 44 }}
    >
      {copied ? UI.copied : UI.copyText}
    </button>
  );
}

function Card({ row, signedUrls }: { row: LibraryRow; signedUrls: Record<string, string> }) {
  return (
    <div className="panel">
      <div className="panel-pad">
        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: 6 }}>
          {row.campaign && <span style={{ fontSize: 12, color: "var(--fg-faint)" }}>{row.campaign.name}</span>}
          <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)" }}>{UI.version(row.versionNumber)}</span>
        </div>
        <Link href={`/marketing/${row.id}`} style={{ textDecoration: "none" }}>
          <div style={{ fontSize: 15, fontWeight: 600, color: "var(--fg)", marginBottom: 3 }}>{row.title}</div>
        </Link>
        {row.purpose && <p style={{ fontSize: 13, color: "var(--fg-mute)", marginBottom: 10 }}>{row.purpose}</p>}
        <p
          style={{
            fontSize: 16, lineHeight: 1.6, color: "var(--fg-soft)", marginBottom: 12,
            display: "-webkit-box", WebkitLineClamp: 6, WebkitBoxOrient: "vertical", overflow: "hidden",
          }}
        >
          {plainTextPreview(row.body)}
        </p>

        <div className="flex items-center gap-2 flex-wrap" style={{ marginBottom: row.assets.length > 0 || row.usedBy.length > 0 ? 12 : 0 }}>
          <CopyButton text={row.body} />
          <Link href={`/marketing/${row.id}`} className="btn sm ghost" style={{ minHeight: 44 }}>
            {UI.version(row.versionNumber)} →
          </Link>
        </div>

        {row.assets.length > 0 && (
          <div className="flex gap-2 flex-wrap" style={{ marginBottom: row.usedBy.length > 0 ? 12 : 0 }}>
            {row.assets.map((a) => {
              const url = a.storagePath ? signedUrls[a.storagePath] : (isHttpUrl(a.url) ? a.url : null);
              if (!url) return null;
              if (a.kind === "image") {
                return (
                  <a key={a.id} href={url} target="_blank" rel="noopener noreferrer">
                    <img src={url} alt={a.caption ?? row.title} style={{ width: 80, height: 80, objectFit: "cover", borderRadius: 6, border: "1px solid var(--line-soft)" }} />
                  </a>
                );
              }
              return (
                <a key={a.id} href={url} target="_blank" rel="noopener noreferrer" className="btn sm" style={{ minHeight: 44 }}>
                  {UI.download}
                </a>
              );
            })}
          </div>
        )}

        {row.usedBy.length > 0 && (
          <div className="flex gap-1.5 flex-wrap">
            {row.usedBy.map((u) => (
              <span key={u} style={{ fontSize: 12, color: "var(--fg-mute)", background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 20, padding: "2px 8px" }}>
                {u}
              </span>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export function LibraryClient({
  rows, signedUrls, filterOptions,
}: {
  rows: LibraryRow[];
  signedUrls: Record<string, string>;
  filterOptions: { campaigns: { id: number; name: string }[]; formats: string[] };
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  function setFilter(key: string, value: string) {
    const params = new URLSearchParams(searchParams.toString());
    if (value === "all") params.delete(key);
    else params.set(key, value);
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
      </div>

      {rows.length === 0 ? (
        <div className="panel">
          <div className="panel-pad" style={{ textAlign: "center", color: "var(--fg-mute)", fontSize: 14 }}>{UI.noLiveMatch}</div>
        </div>
      ) : (
        <div className="space-y-8">
          {groups.map(([category, items]) => (
            <section key={category}>
              <h2 style={{ fontSize: 14, fontWeight: 600, color: "var(--fg)", marginBottom: 10 }}>
                {CATEGORY_LABEL[category as ContentCategory] ?? category}
                <span className="font-mono-ndt" style={{ marginLeft: 8, fontSize: 12, color: "var(--fg-faint)" }}>{items.length}</span>
              </h2>
              <div className="space-y-3" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(min(320px, 100%), 1fr))", gap: 12 }}>
                {items.map((row) => <Card key={row.id} row={row} signedUrls={signedUrls} />)}
              </div>
            </section>
          ))}
        </div>
      )}
    </div>
  );
}
