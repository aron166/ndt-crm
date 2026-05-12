"use client";

import { useState, useEffect, useRef, useTransition, useCallback } from "react";
import { useRouter } from "next/navigation";
import { globalSearch, type SearchResults } from "@/app/actions/search";
import { Building2, Users, TrendingUp, CheckSquare, Tag, Search, X } from "lucide-react";
import { PipelineStatusBadge } from "./PipelineStatusBadge";
import { TaskStatusBadge } from "./TaskStatusBadge";
import { cn } from "@/lib/utils";

const EMPTY: SearchResults = { companies: [], persons: [], deals: [], tasks: [], tags: [] };

type ResultItem =
  | { kind: "company"; id: number; label: string; sub: string | null; status: string | null }
  | { kind: "person";  id: number; label: string; sub: string | null }
  | { kind: "deal";    id: number; label: string; sub: string; value: number | null }
  | { kind: "task";    id: number; label: string; status: string }
  | { kind: "tag";     id: number; label: string; color: string; count: number };

function hrefFor(item: ResultItem): string {
  switch (item.kind) {
    case "company": return `/companies/${item.id}`;
    case "person":  return `/persons/${item.id}`;
    case "deal":    return `/deals`;
    case "task":    return `/tasks/${item.id}`;
    case "tag":     return `/companies?tag=${encodeURIComponent(item.label)}`;
  }
}

function iconFor(kind: ResultItem["kind"]) {
  const s = { width: 14, height: 14, flexShrink: 0 as const, color: "var(--fg-faint)" };
  switch (kind) {
    case "company": return <Building2 style={s} />;
    case "person":  return <Users style={s} />;
    case "deal":    return <TrendingUp style={s} />;
    case "task":    return <CheckSquare style={s} />;
    case "tag":     return <Tag style={s} />;
  }
}

function flattenResults(r: SearchResults): ResultItem[] {
  return [
    ...r.companies.map((c) => ({ kind: "company" as const, id: c.id, label: c.name, sub: c.city, status: c.pipelineStatus })),
    ...r.persons.map((p)   => ({ kind: "person" as const,  id: p.id, label: `${p.lastName ?? ""} ${p.firstName ?? ""}`.trim(), sub: p.company })),
    ...r.deals.map((d)     => ({ kind: "deal" as const,    id: d.id, label: d.title, sub: d.companyName, value: d.value })),
    ...r.tasks.map((t)     => ({ kind: "task" as const,    id: t.id, label: t.title, status: t.status })),
    ...r.tags.map((t)      => ({ kind: "tag" as const,     id: t.id, label: t.name, color: t.color, count: t.count })),
  ];
}

const GROUP_LABELS: Record<ResultItem["kind"], string> = {
  company: "Cégek", person: "Személyek", deal: "Dealek", task: "Feladatok", tag: "Tagek",
};

interface CommandPaletteProps {
  open: boolean;
  onClose: () => void;
}

export function CommandPalette({ open, onClose }: CommandPaletteProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<SearchResults>(EMPTY);
  const [activeIdx, setActiveIdx] = useState(0);
  const [, startTransition] = useTransition();
  const inputRef = useRef<HTMLInputElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const items = flattenResults(results);
  const hasResults = items.length > 0;

  // Focus input when opened
  useEffect(() => {
    if (open) {
      setQuery(""); setResults(EMPTY); setActiveIdx(0);
      setTimeout(() => inputRef.current?.focus(), 50);
    }
  }, [open]);

  // Debounced search
  const search = useCallback((q: string) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setResults(EMPTY); return; }
    timerRef.current = setTimeout(() => {
      startTransition(async () => {
        const r = await globalSearch(q);
        setResults(r);
        setActiveIdx(0);
      });
    }, 150);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    setQuery(e.target.value);
    search(e.target.value);
  }

  function navigate(item: ResultItem) {
    router.push(hrefFor(item));
    onClose();
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Escape") { onClose(); return; }
    if (!hasResults) return;
    if (e.key === "ArrowDown") { e.preventDefault(); setActiveIdx((i) => Math.min(i + 1, items.length - 1)); }
    if (e.key === "ArrowUp")   { e.preventDefault(); setActiveIdx((i) => Math.max(i - 1, 0)); }
    if (e.key === "Enter")     { e.preventDefault(); navigate(items[activeIdx]); }
  }

  if (!open) return null;

  // Group items for rendering
  const grouped = items.reduce<{ kind: ResultItem["kind"]; items: ResultItem[] }[]>((acc, item) => {
    const last = acc[acc.length - 1];
    if (last && last.kind === item.kind) { last.items.push(item); }
    else { acc.push({ kind: item.kind, items: [item] }); }
    return acc;
  }, []);

  let globalIdx = 0;

  return (
    <div
      className="fixed inset-0 z-50 flex items-start justify-center pt-[12vh]"
      style={{ background: "oklch(0 0 0 / 0.6)", backdropFilter: "blur(6px)" }}
      onClick={onClose}
    >
      <div
        className="w-full max-w-xl rounded-xl overflow-hidden mount"
        style={{
          background: "var(--bg-panel)",
          border: "1px solid var(--line)",
          boxShadow: "var(--glow-indigo), 0 24px 64px -12px rgba(0,0,0,0.8)",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Search input */}
        <div className="flex items-center gap-3 px-4" style={{ borderBottom: "1px solid var(--line-soft)", height: 52 }}>
          <Search style={{ width: 16, height: 16, color: "var(--fg-faint)", flexShrink: 0 }} />
          <input
            ref={inputRef}
            value={query}
            onChange={handleInput}
            onKeyDown={handleKeyDown}
            placeholder="Keresés cégekben, személyekben, dealekben..."
            style={{
              flex: 1, background: "transparent", border: "none", outline: "none",
              fontSize: 14, color: "var(--fg)",
            }}
          />
          {query && (
            <button onClick={() => { setQuery(""); setResults(EMPTY); inputRef.current?.focus(); }}
              style={{ color: "var(--fg-faint)", cursor: "pointer" }}>
              <X style={{ width: 14, height: 14 }} />
            </button>
          )}
          <kbd style={{ fontFamily: "var(--font-geist-mono)", fontSize: 10, padding: "2px 6px", background: "var(--bg-raised)", border: "1px solid var(--line-soft)", borderRadius: 4, color: "var(--fg-faint)" }}>
            ESC
          </kbd>
        </div>

        {/* Results */}
        <div style={{ maxHeight: "60vh", overflowY: "auto" }}>
          {!query.trim() && (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--fg-faint)" }}>
              Kezdj el gépelni a kereséshez...
            </div>
          )}

          {query.trim() && !hasResults && (
            <div style={{ padding: "24px 16px", textAlign: "center", fontSize: 13, color: "var(--fg-faint)" }}>
              Nincs találat: <strong style={{ color: "var(--fg-mute)" }}>{query}</strong>
            </div>
          )}

          {grouped.map(({ kind, items: groupItems }) => (
            <div key={kind}>
              <div style={{
                padding: "8px 16px 4px",
                fontSize: 10, fontWeight: 600,
                textTransform: "uppercase", letterSpacing: "0.1em",
                color: "var(--fg-faint)",
              }}>
                {GROUP_LABELS[kind]}
              </div>
              {groupItems.map((item) => {
                const idx = globalIdx++;
                const isActive = idx === activeIdx;
                return (
                  <button
                    key={`${item.kind}-${item.id}`}
                    onClick={() => navigate(item)}
                    onMouseEnter={() => setActiveIdx(idx)}
                    className="w-full text-left flex items-center gap-3 px-4 py-2.5 transition-colors"
                    style={{
                      background: isActive ? "oklch(0.66 0.19 278 / 0.12)" : "transparent",
                      borderLeft: isActive ? "2px solid var(--indigo)" : "2px solid transparent",
                    }}
                  >
                    {iconFor(item.kind)}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, color: "var(--fg)", fontWeight: 500, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                        {item.label}
                      </div>
                      {"sub" in item && item.sub && (
                        <div style={{ fontSize: 11, color: "var(--fg-faint)", marginTop: 1 }}>{item.sub}</div>
                      )}
                    </div>
                    {item.kind === "company" && item.status && (
                      <PipelineStatusBadge status={item.status} />
                    )}
                    {item.kind === "task" && (
                      <TaskStatusBadge status={item.status} />
                    )}
                    {item.kind === "tag" && (
                      <div className="flex items-center gap-2">
                        <span style={{ width: 8, height: 8, borderRadius: "50%", background: item.color, boxShadow: `0 0 6px ${item.color}` }} />
                        <span className="font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)" }}>{item.count}</span>
                      </div>
                    )}
                    {item.kind === "deal" && item.value && (
                      <span className="font-mono-ndt" style={{ fontSize: 11, color: "var(--mint)" }}>
                        {Math.round(item.value).toLocaleString("hu-HU")} HUF
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          ))}
        </div>

        {/* Footer hint */}
        {hasResults && (
          <div className="flex items-center gap-4 px-4" style={{ height: 36, borderTop: "1px solid var(--line-soft)", fontSize: 11, color: "var(--fg-faint)", fontFamily: "var(--font-geist-mono)" }}>
            <span>↑↓ navigáció</span>
            <span>↵ megnyitás</span>
            <span>ESC bezárás</span>
          </div>
        )}
      </div>
    </div>
  );
}
