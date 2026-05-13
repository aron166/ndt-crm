"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Plus, Trash2, Check } from "lucide-react";
import { createSavedView, deleteSavedView } from "@/app/actions/saved-views";

interface SavedView {
  id: number;
  name: string;
  filters: unknown;
}

interface SavedViewsDropdownProps {
  entityType: "company" | "person" | "deal" | "task";
  basePath: string;           // e.g. "/companies"
  currentParams: Record<string, string>; // current active filter params (no page/fa)
  views: SavedView[];
}

function filtersToParams(filters: unknown): Record<string, string> {
  if (!filters || typeof filters !== "object") return {};
  return Object.fromEntries(
    Object.entries(filters as Record<string, unknown>).filter(([, v]) => v != null && v !== "")
  ) as Record<string, string>;
}

function isActiveView(view: SavedView, current: Record<string, string>): boolean {
  const saved = filtersToParams(view.filters);
  const savedKeys = Object.keys(saved).sort();
  const currentKeys = Object.keys(current).filter((k) => current[k]).sort();
  if (savedKeys.join(",") !== currentKeys.join(",")) return false;
  return savedKeys.every((k) => saved[k] === current[k]);
}

export function SavedViewsDropdown({ entityType, basePath, currentParams, views }: SavedViewsDropdownProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const [name, setName] = useState("");
  const [isPending, startTransition] = useTransition();

  const activeView = views.find((v) => isActiveView(v, currentParams));
  const hasFilters = Object.values(currentParams).some(Boolean);

  function applyView(view: SavedView) {
    const params = new URLSearchParams(filtersToParams(view.filters));
    router.push(`${basePath}?${params.toString()}`);
    setOpen(false);
  }

  function handleSave() {
    if (!name.trim()) return;
    startTransition(async () => {
      await createSavedView(entityType, name, currentParams);
      setName("");
      setSaving(false);
      setOpen(false);
    });
  }

  function handleDelete(id: number) {
    startTransition(async () => {
      await deleteSavedView(id);
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <button
        onClick={() => setOpen((o) => !o)}
        className="flex items-center gap-1.5"
        style={{
          padding: "5px 10px",
          background: activeView ? "var(--indigo-soft)" : "var(--bg-panel)",
          border: `1px solid ${activeView ? "var(--indigo-line)" : "var(--line-soft)"}`,
          borderRadius: 6, fontSize: 12,
          color: activeView ? "var(--indigo)" : "var(--fg-soft)",
          cursor: "pointer",
          transition: "border-color .15s, background .15s",
        }}
      >
        <Bookmark style={{ width: 12, height: 12 }} />
        {activeView ? activeView.name : "Nézetek"}
        {views.length > 0 && !activeView && (
          <span className="font-mono-ndt" style={{ fontSize: 10, color: "var(--fg-faint)" }}>
            {views.length}
          </span>
        )}
      </button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
            onClick={() => { setOpen(false); setSaving(false); }}
          />
          {/* Dropdown */}
          <div
            style={{
              position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50,
              minWidth: 220,
              background: "var(--bg-panel)", border: "1px solid var(--line-soft)",
              borderRadius: 8, boxShadow: "0 8px 24px oklch(0 0 0 / 0.4)",
              overflow: "hidden",
            }}
          >
            {views.length > 0 && (
              <>
                <div style={{ padding: "8px 12px 4px", fontSize: 10, fontWeight: 600, textTransform: "uppercase", letterSpacing: "0.1em", color: "var(--fg-faint)" }}>
                  Mentett nézetek
                </div>
                {views.map((v) => {
                  const active = isActiveView(v, currentParams);
                  return (
                    <div
                      key={v.id}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", transition: "background .12s" }}
                      onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                      onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ flex: 1 }} onClick={() => applyView(v)}>
                        <span style={{ fontSize: 13, color: active ? "var(--indigo)" : "var(--fg-soft)", fontWeight: active ? 500 : 400 }}>
                          {v.name}
                        </span>
                      </div>
                      {active && <Check style={{ width: 12, height: 12, color: "var(--indigo)", flexShrink: 0 }} />}
                      <button
                        onClick={() => handleDelete(v.id)}
                        style={{ background: "none", border: "none", cursor: "pointer", padding: 2, color: "var(--fg-faint)", flexShrink: 0 }}
                        onMouseOver={(e) => (e.currentTarget.style.color = "var(--coral)")}
                        onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-faint)")}
                      >
                        <Trash2 style={{ width: 11, height: 11 }} />
                      </button>
                    </div>
                  );
                })}
                <div style={{ borderTop: "1px solid var(--line-soft)", margin: "4px 0" }} />
              </>
            )}

            {/* Save current view */}
            {hasFilters && !saving && (
              <button
                onClick={() => setSaving(true)}
                className="flex items-center gap-2 w-full"
                style={{ padding: "8px 12px", background: "none", border: "none", cursor: "pointer", fontSize: 12, color: "var(--fg-mute)", transition: "background .12s" }}
                onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
              >
                <Plus style={{ width: 12, height: 12 }} />
                Jelenlegi nézet mentése
              </button>
            )}

            {saving && (
              <div style={{ padding: "8px 12px", display: "flex", gap: 6 }}>
                <input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setSaving(false); }}
                  placeholder="Nézet neve…"
                  style={{
                    flex: 1, padding: "4px 8px", fontSize: 12,
                    background: "var(--bg-0)", border: "1px solid var(--line-soft)",
                    borderRadius: 4, color: "var(--fg)", outline: "none",
                  }}
                />
                <button
                  onClick={handleSave}
                  disabled={!name.trim() || isPending}
                  style={{
                    padding: "4px 10px", borderRadius: 4, fontSize: 12,
                    background: "var(--indigo)", color: "white", border: "none",
                    cursor: name.trim() ? "pointer" : "default",
                    opacity: name.trim() ? 1 : 0.5,
                  }}
                >
                  Ment
                </button>
              </div>
            )}

            {!hasFilters && views.length === 0 && (
              <div style={{ padding: "12px", fontSize: 12, color: "var(--fg-faint)", textAlign: "center" }}>
                Szűrj rá valamire, majd mentsd el nézetre.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
