"use client";

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Bookmark, Plus, Trash2, Check } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
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
  const [deleteError, setDeleteError] = useState<string | null>(null);
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
      // A view used as a campaign's outreach target list refuses to delete.
      // Swallowing that would look like the delete worked and leave the view
      // on screen with no reason given.
      const res = await deleteSavedView(id);
      if (res?.error) setDeleteError(res.error);
    });
  }

  return (
    <div style={{ position: "relative" }}>
      <Button
        type="button"
        variant="outline"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        style={activeView ? { color: "var(--ui-text-link)", borderColor: "var(--ui-accent)" } : undefined}
      >
        <Bookmark style={{ width: 12, height: 12 }} />
        {activeView ? activeView.name : "Nézetek"}
        {views.length > 0 && !activeView && (
          <span style={{ fontSize: 12, color: "var(--ui-text-muted)" }}>
            {views.length}
          </span>
        )}
      </Button>

      {open && (
        <>
          {/* Backdrop */}
          <div
            style={{ position: "fixed", inset: 0, zIndex: 49 }}
            onClick={() => { setOpen(false); setSaving(false); setDeleteError(null); }}
          />
          {/* Dropdown */}
          <div
            style={{
              position: "absolute", right: 0, top: "calc(100% + 6px)", zIndex: 50,
              minWidth: 220,
              background: "var(--ui-surface-overlay)",
              borderRadius: "var(--ui-radius-surface)", boxShadow: "var(--ui-shadow-overlay)",
              overflow: "hidden",
            }}
          >
            {views.length > 0 && (
              <>
                <div style={{ padding: "8px 12px 4px", fontSize: 12, fontWeight: 600, color: "var(--ui-text-muted)" }}>
                  Mentett nézetek
                </div>
                {views.map((v) => {
                  const active = isActiveView(v, currentParams);
                  return (
                    <div
                      key={v.id}
                      style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 12px", cursor: "pointer", transition: "background .12s" }}
                      onMouseOver={(e) => (e.currentTarget.style.background = "var(--ui-hover)")}
                      onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
                    >
                      <div style={{ flex: 1 }} onClick={() => applyView(v)}>
                        <span style={{ fontSize: 14, color: active ? "var(--ui-text-link)" : "var(--ui-text-muted)", fontWeight: active ? 500 : 400 }}>
                          {v.name}
                        </span>
                      </div>
                      {active && <Check style={{ width: 12, height: 12, color: "var(--ui-text-link)", flexShrink: 0 }} />}
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon-xs"
                        aria-label={`Törlés: ${v.name}`} // PROPOSAL copy
                        onClick={() => handleDelete(v.id)}
                      >
                        <Trash2 style={{ width: 12, height: 12 }} />
                      </Button>
                    </div>
                  );
                })}
                {deleteError && (
                  <div style={{ padding: "4px 12px 8px", fontSize: 12, color: "var(--ui-danger-text)" }}>
                    {deleteError}
                  </div>
                )}
                <div style={{ borderTop: "1px solid var(--ui-border)", margin: "4px 0" }} />
              </>
            )}

            {/* Save current view */}
            {hasFilters && !saving && (
              <Button type="button" variant="ghost" className="w-full justify-start" onClick={() => setSaving(true)}>
                <Plus style={{ width: 12, height: 12 }} />
                Jelenlegi nézet mentése
              </Button>
            )}

            {saving && (
              <div style={{ padding: "8px 12px", display: "flex", gap: 6 }}>
                <Input
                  autoFocus
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") handleSave(); if (e.key === "Escape") setSaving(false); }}
                  placeholder="Nézet neve…"
                />
                <Button type="button" onClick={handleSave} disabled={!name.trim() || isPending}>
                  Ment
                </Button>
              </div>
            )}

            {!hasFilters && views.length === 0 && (
              <div style={{ padding: "12px", fontSize: 14, color: "var(--ui-text-muted)", textAlign: "center" }}>
                Szűrj rá valamire, majd mentsd el nézetre.
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}
