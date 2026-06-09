"use client";

import { Suspense, useMemo, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { SlidersHorizontal, X, Check } from "lucide-react";

export interface FacetOption {
  value: string;
  label: string;
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

function CompanyFilterBarInner({ facets }: { facets: CompanyFacets }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [open, setOpen] = useState(false);

  // Draft = the selection being edited; seeded from the live URL on open.
  const liveSelection = useMemo(() => {
    const sel: Record<string, Set<string>> = {};
    for (const g of GROUPS) {
      const raw = searchParams.get(g.param);
      sel[g.param] = new Set(raw ? raw.split(",").map((s) => s.trim()).filter(Boolean) : []);
    }
    return sel;
  }, [searchParams]);

  const [draft, setDraft] = useState<Record<string, Set<string>>>(liveSelection);

  const activeCount = useMemo(
    () => ALL_PARAMS.reduce((n, p) => n + (searchParams.get(p) ? 1 : 0), 0),
    [searchParams],
  );

  function openPanel() {
    setDraft(liveSelection); // re-seed from current URL
    setOpen(true);
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
          <span className="font-mono-ndt" style={{ fontSize: 10 }}>({activeCount})</span>
        )}
      </button>

      {open && (
        <>
          {/* click-away */}
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div
            className="absolute right-0 z-50 mt-2 w-[340px] max-h-[70vh] overflow-y-auto rounded-xl p-3"
            style={{
              background: "var(--bg-panel)",
              border: "1px solid var(--line-soft)",
              boxShadow: "0 12px 32px oklch(0 0 0 / 0.35)",
            }}
          >
            {GROUPS.map((g) => {
              const opts = facets[g.key];
              if (!opts.length) return null;
              const set = draft[g.param];
              return (
                <div key={g.param} className="mb-3">
                  <div
                    className="mb-1.5"
                    style={{
                      fontSize: 10, fontWeight: 600, textTransform: "uppercase",
                      letterSpacing: "0.1em", color: "var(--fg-faint)",
                    }}
                  >
                    {g.label}
                  </div>
                  <div className="flex flex-wrap gap-1.5">
                    {opts.map((o) => {
                      const on = set.has(o.value);
                      return (
                        <button
                          key={o.value}
                          type="button"
                          onClick={() => toggle(g.param, o.value)}
                          className="flex items-center gap-1 rounded-full px-2 py-1 text-xs transition-colors"
                          style={{
                            border: `1px solid ${on ? "var(--indigo)" : "var(--line-soft)"}`,
                            background: on ? "var(--indigo-soft)" : "transparent",
                            color: on ? "var(--indigo)" : "var(--fg-mute)",
                          }}
                        >
                          {on && <Check className="size-3" />}
                          {o.label}
                        </button>
                      );
                    })}
                  </div>
                </div>
              );
            })}

            <div
              className="flex items-center justify-between gap-2 pt-2 mt-1"
              style={{ borderTop: "1px solid var(--line-soft)" }}
            >
              <button
                type="button"
                onClick={clearAll}
                disabled={activeCount === 0 && draftCount === 0}
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
