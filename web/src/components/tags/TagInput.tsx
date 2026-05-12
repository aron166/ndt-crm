"use client";

import { useState, useRef, useTransition } from "react";
import { TagChip } from "./TagChip";
import { addTag, removeTag, type TaggableType } from "@/app/actions/tags";

const PRESET_COLORS = [
  "#6366f1", "#8b5cf6", "#ec4899", "#f43f5e",
  "#f97316", "#eab308", "#22c55e", "#14b8a6",
  "#3b82f6", "#64748b",
];

interface Tag { id: number; name: string; color: string; }

interface TagInputProps {
  taggableType: TaggableType;
  taggableId: number;
  initialTags: Tag[];
}

export function TagInput({ taggableType, taggableId, initialTags }: TagInputProps) {
  const [tags, setTags] = useState<Tag[]>(initialTags);
  const [query, setQuery] = useState("");
  const [suggestions, setSuggestions] = useState<Tag[]>([]);
  const [open, setOpen] = useState(false);
  const [pendingColor, setPendingColor] = useState(PRESET_COLORS[0]);
  const [isPending, startTransition] = useTransition();
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  async function fetchSuggestions(q: string) {
    const res = await fetch(`/api/search/tags?q=${encodeURIComponent(q)}`);
    const data: Tag[] = await res.json();
    // filter out already-applied tags
    setSuggestions(data.filter((t) => !tags.some((ex) => ex.id === t.id)));
    setOpen(true);
  }

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setSuggestions([]); setOpen(false); return; }
    timerRef.current = setTimeout(() => fetchSuggestions(q), 150);
  }

  function applyTag(tag: Tag) {
    if (tags.some((t) => t.id === tag.id)) return;
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    setTags((prev) => [...prev, tag]);
    startTransition(async () => { await addTag(taggableType, taggableId, tag.name, tag.color); });
  }

  function createAndApply() {
    const name = query.trim();
    if (!name) return;
    setQuery("");
    setSuggestions([]);
    setOpen(false);
    startTransition(async () => {
      const result = await addTag(taggableType, taggableId, name, pendingColor);
      if (result.success && result.tag) {
        setTags((prev) => [...prev, result.tag!]);
      }
    });
  }

  function handleRemove(tagId: number) {
    setTags((prev) => prev.filter((t) => t.id !== tagId));
    startTransition(() => removeTag(taggableType, taggableId, tagId));
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") { e.preventDefault(); createAndApply(); }
    if (e.key === "Escape") { setOpen(false); }
  }

  const exactMatch = suggestions.some((s) => s.name.toLowerCase() === query.trim().toLowerCase());

  return (
    <div ref={containerRef} className="space-y-2">
      <div className="flex flex-wrap gap-1.5 min-h-[1.5rem]">
        {tags.map((t) => (
          <TagChip key={t.id} name={t.name} color={t.color} onRemove={() => handleRemove(t.id)} />
        ))}
      </div>

      <div className="relative">
        <input
          type="text"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query) fetchSuggestions(query); }}
          placeholder="Tag hozzáadása..."
          className="h-7 w-full rounded-lg border border-input bg-transparent px-2.5 text-xs outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-2 focus:ring-ring/30"
          disabled={isPending}
        />

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-md">
            {suggestions.map((s) => (
              <button
                key={s.id}
                type="button"
                onMouseDown={(e) => { e.preventDefault(); applyTag(s); }}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs hover:bg-slate-50 text-left"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                {s.name}
              </button>
            ))}
            {!exactMatch && query.trim() && (
              <>
                {suggestions.length > 0 && <div className="border-t border-slate-100" />}
                <div className="px-3 py-2">
                  <p className="text-xs text-slate-500 mb-1.5">
                    Létrehozás: <strong>{query.trim()}</strong>
                  </p>
                  <div className="flex items-center gap-1.5 flex-wrap mb-1.5">
                    {PRESET_COLORS.map((c) => (
                      <button
                        key={c}
                        type="button"
                        onMouseDown={(e) => { e.preventDefault(); setPendingColor(c); }}
                        className="w-4 h-4 rounded-full transition-transform hover:scale-110"
                        style={{
                          backgroundColor: c,
                          outline: pendingColor === c ? `2px solid ${c}` : "none",
                          outlineOffset: "2px",
                        }}
                      />
                    ))}
                  </div>
                  <button
                    type="button"
                    onMouseDown={(e) => { e.preventDefault(); createAndApply(); }}
                    className="text-xs text-indigo-600 hover:text-indigo-700 font-medium"
                  >
                    + Enter lenyomásával is létrehozható
                  </button>
                </div>
              </>
            )}
            {suggestions.length === 0 && exactMatch && (
              <div className="px-3 py-2 text-xs text-slate-400">Már hozzá van adva</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
