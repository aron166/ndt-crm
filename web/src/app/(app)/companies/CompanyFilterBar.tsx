"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X, Check, Search, ChevronRight, ChevronDown } from "lucide-react";

export interface FacetOption {
  value: string;
  label: string;
  /** Optional muted secondary text (e.g. the TEÁOR code behind the name). */
  hint?: string;
}
export interface CompanyFacets {
  industry: FacetOption[];
  teaor: FacetOption[];
  county: FacetOption[];
  warmth: FacetOption[];
  accountType: FacetOption[];
  status: FacetOption[];
  pipelineStatus: FacetOption[];
}

/** URL param key ←→ facet key. Order = display order in the panel. */
const GROUPS: { key: keyof CompanyFacets; param: string; label: string }[] = [
  { key: "industry", param: "industry", label: "Iparág" },
  { key: "teaor", param: "teaor", label: "TEÁOR" },
  { key: "county", param: "county", label: "Megye" },
  { key: "warmth", param: "warmth", label: "Hőfok" },
  { key: "accountType", param: "accountType", label: "Kategória" },
  { key: "status", param: "status", label: "Státusz" },
  { key: "pipelineStatus", param: "pipeline_status", label: "Pipeline" },
];

const ALL_PARAMS = GROUPS.map((g) => g.param);

/** Above this many options a group gets a name-filter box (matches label/hint). */
const SEARCH_THRESHOLD = 8;

/** One collapsible filter group. Collapsed by default so the panel reads as a
 * tidy list of categories, not a dump — you expand only the one you need. Tiny
 * enums are plain toggle chips; long lists become a name-filterable, selected-
 * first checklist. */
function FilterGroup({
  label, options, selected, onToggle, open, onToggleOpen,
}: {
  label: string;
  options: FacetOption[];
  selected: Set<string>;
  onToggle: (value: string) => void;
  open: boolean;
  onToggleOpen: () => void;
}) {
  const [query, setQuery] = useState("");
  const searchable = options.length > SEARCH_THRESHOLD;

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    const matched = q
      ? options.filter((o) =>
          o.label.toLowerCase().includes(q) || o.hint?.toLowerCase().includes(q))
      : options;
    // Selected first, then alphabetical-ish by label (keeps picks in view).
    return [...matched].sort((a, b) => {
      const sa = selected.has(a.value) ? 0 : 1;
      const sb = selected.has(b.value) ? 0 : 1;
      return sa - sb || a.label.localeCompare(b.label, "hu");
    });
  }, [options, query, selected]);

  if (options.length === 0) return null;

  const selectedCount = options.reduce((n, o) => n + (selected.has(o.value) ? 1 : 0), 0);

  return (
    <div style={{ borderBottom: "1px solid var(--line-soft)" }}>
      {/* Category header — click to expand/collapse */}
      <button
        type="button"
        onClick={onToggleOpen}
        className="flex w-full items-center gap-2 py-2.5 text-left"
      >
        {open
          ? <ChevronDown className="size-3.5" style={{ color: "var(--fg-faint)", flexShrink: 0 }} />
          : <ChevronRight className="size-3.5" style={{ color: "var(--fg-faint)", flexShrink: 0 }} />}
        <span style={{ fontSize: 14.5, fontWeight: 600, color: selectedCount ? "var(--fg)" : "var(--fg-soft)" }}>
          {label}
        </span>
        {selectedCount > 0 && (
          <span className="rounded-full px-1.5 font-mono-ndt"
            style={{ fontSize: 12, background: "var(--indigo-soft)", color: "var(--indigo)" }}>
            {selectedCount}
          </span>
        )}
      </button>

      {open && <div className="pb-3">

      {searchable && (
        <div className="relative mb-1.5">
          <Search className="size-3.5" style={{ position: "absolute", left: 8, top: "50%", transform: "translateY(-50%)", color: "var(--fg-faint)" }} />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Szűrés név szerint…"
            className="w-full"
            style={{ padding: "5px 8px 5px 26px", fontSize: 14, background: "var(--bg-0)", border: "1px solid var(--line-soft)", borderRadius: 6, color: "var(--fg)", outline: "none" }}
          />
        </div>
      )}

      <div style={searchable ? { maxHeight: 168, overflowY: "auto", paddingRight: 2 } : undefined}>
        {visible.length === 0 ? (
          <div style={{ fontSize: 14, color: "var(--fg-faint)", padding: "4px 2px" }}>Nincs találat</div>
        ) : searchable ? (
          // Long list → row checklist (name leads, hint muted).
          <div className="flex flex-col gap-0.5">
            {visible.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  className="flex items-center gap-2 rounded-md px-2 py-1 text-left transition-colors"
                  style={{ background: on ? "var(--indigo-soft)" : "transparent", color: on ? "var(--indigo)" : "var(--fg-soft)" }}
                >
                  <span className="flex items-center justify-center" style={{ width: 14, height: 14, borderRadius: 4, border: `1px solid ${on ? "var(--indigo)" : "var(--line-soft)"}`, flexShrink: 0 }}>
                    {on && <Check className="size-3" />}
                  </span>
                  <span style={{ fontSize: 14.5, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.label}</span>
                  {o.hint && <span className="font-mono-ndt" style={{ fontSize: 12, color: "var(--fg-faint)", marginLeft: "auto", flexShrink: 0 }}>{o.hint}</span>}
                </button>
              );
            })}
          </div>
        ) : (
          // Tiny enum → plain toggle chips.
          <div className="flex flex-wrap gap-1.5">
            {visible.map((o) => {
              const on = selected.has(o.value);
              return (
                <button
                  key={o.value}
                  type="button"
                  onClick={() => onToggle(o.value)}
                  className="flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors"
                  style={{ border: `1px solid ${on ? "var(--indigo)" : "var(--line-soft)"}`, background: on ? "var(--indigo-soft)" : "transparent", color: on ? "var(--indigo)" : "var(--fg-mute)" }}
                >
                  {on && <Check className="size-3" />}
                  {o.label}
                </button>
              );
            })}
          </div>
        )}
      </div>

      </div>}
    </div>
  );
}

function CompanyFilterBarInner({ facets }: { facets: CompanyFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Draft = the selection being edited; seeded from the live URL on open.
  const liveSelection = useMemo(() => {
    const sel: Record<string, Set<string>> = {};
    for (const g of GROUPS) {
      // Parser accepts both repeated AND comma-joined params — flatten both so a
      // value isn't silently dropped on the next Apply.
      const values = searchParams
        .getAll(g.param)
        .flatMap((raw) => raw.split(","))
        .map((s) => s.trim())
        .filter(Boolean);
      sel[g.param] = new Set(values);
    }
    return sel;
  }, [searchParams]);

  const [draft, setDraft] = useState<Record<string, Set<string>>>(liveSelection);
  // Which category sections are expanded. Default: only the ones already in use.
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const activeCount = useMemo(
    () => ALL_PARAMS.reduce((n, p) => n + (searchParams.get(p) ? 1 : 0), 0),
    [searchParams],
  );

  function openPanel() {
    setDraft(liveSelection); // re-seed from current URL
    // Auto-expand the categories that already have a selection, collapse the rest.
    setExpanded(new Set(GROUPS.map((g) => g.param).filter((p) => liveSelection[p]?.size)));
    setOpen(true);
  }

  function toggleExpand(param: string) {
    setExpanded((prev) => {
      const next = new Set(prev);
      if (next.has(param)) next.delete(param);
      else next.add(param);
      return next;
    });
  }

  function toggle(param: string, value: string) {
    setDraft((prev) => {
      const next = { ...prev, [param]: new Set(prev[param]) };
      const set = next[param];
      if (set.has(value)) set.delete(value);
      else set.add(value);
      return next;
    });
  }

  function apply() {
    const params = new URLSearchParams(searchParams.toString());
    for (const g of GROUPS) {
      const vals = [...draft[g.param]];
      if (vals.length) params.set(g.param, vals.join(","));
      else params.delete(g.param);
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  function clearAll() {
    const params = new URLSearchParams(searchParams.toString());
    for (const p of ALL_PARAMS) params.delete(p);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
  }

  const draftCount = ALL_PARAMS.reduce((n, p) => n + (draft[p]?.size ? 1 : 0), 0);
  const draftValueCount = ALL_PARAMS.reduce((n, p) => n + (draft[p]?.size ?? 0), 0);

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => (open ? setOpen(false) : openPanel())}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
        style={{
          border: "1px solid var(--line-soft)",
          color: activeCount ? "var(--indigo)" : "var(--fg-mute)",
          background: activeCount ? "var(--indigo-soft)" : "transparent",
        }}
      >
        <SlidersHorizontal className="size-3.5" />
        Szűrők
        {activeCount > 0 && (
          <span className="font-mono-ndt" style={{ fontSize: 12 }}>({activeCount})</span>
        )}
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-50 mt-2 w-[360px] max-h-[74vh] overflow-y-auto rounded-xl p-3"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--line-soft)",
              boxShadow: "0 12px 32px oklch(0 0 0 / 0.35)",
            }}
          >
            {GROUPS.map((g) => (
              <FilterGroup
                key={g.param}
                label={g.label}
                options={facets[g.key]}
                selected={draft[g.param]}
                onToggle={(value) => toggle(g.param, value)}
                open={expanded.has(g.param)}
                onToggleOpen={() => toggleExpand(g.param)}
              />
            ))}

            <div
              className="sticky bottom-0 flex items-center justify-between gap-2 pt-2 mt-1"
              style={{ borderTop: "1px solid var(--line-soft)", background: "var(--bg-panel)" }}
            >
              <button
                type="button"
                onClick={clearAll}
                disabled={activeCount === 0 && draftValueCount === 0}
                className="flex items-center gap-1 text-xs disabled:opacity-40"
                style={{ color: "var(--fg-faint)" }}
              >
                <X className="size-3" /> Mind törlése
              </button>
              <button
                type="button"
                onClick={apply}
                className="rounded-lg px-3 py-1.5 text-xs font-medium"
                style={{ background: "var(--indigo)", color: "white" }}
              >
                Alkalmaz{draftCount > 0 ? ` (${draftCount})` : ""}
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

export function CompanyFilterBar({ facets }: { facets: CompanyFacets }) {
  return (
    <Suspense fallback={null}>
      <CompanyFilterBarInner facets={facets} />
    </Suspense>
  );
}
