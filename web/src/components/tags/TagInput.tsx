"use client";

import { useState, useRef, useTransition } from "react";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { DEFAULT_STAGE_COLORS as PRESET_COLORS, DEFAULT_DATA_COLOR } from "@/lib/data-colors";
import { TagChip } from "./TagChip";
import { addTag, removeTag, type TaggableType } from "@/app/actions/tags";

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
  const [pendingColor, setPendingColor] = useState<string>(DEFAULT_DATA_COLOR);
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
    startTransition(async () => { await removeTag(taggableType, taggableId, tagId); });
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
        <Input
          type="text"
          value={query}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          onFocus={() => { if (query) fetchSuggestions(query); }}
          placeholder="Tag hozzáadása..."
          disabled={isPending}
          className="h-8 min-h-8 text-xs"
        />

        {open && (
          <div className="absolute z-50 mt-1 w-full rounded-[var(--ui-radius-surface)] bg-[var(--ui-surface-overlay)] shadow-[var(--ui-shadow-overlay)]">
            {suggestions.map((s) => (
              <Button
                key={s.id}
                type="button"
                variant="ghost"
                size="sm"
                onMouseDown={(e) => { e.preventDefault(); applyTag(s); }}
                className="w-full justify-start font-normal"
              >
                <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: s.color }} />
                {s.name}
              </Button>
            ))}
            {!exactMatch && query.trim() && (
              <>
                {suggestions.length > 0 && <div className="border-t border-[var(--ui-border)]" />}
                <div className="px-3 py-2">
                  <p className="text-xs text-[var(--ui-text-muted)] mb-1.5">
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
                  <Button
                    type="button"
                    variant="link"
                    size="xs"
                    onMouseDown={(e) => { e.preventDefault(); createAndApply(); }}
                  >
                    + Enter lenyomásával is létrehozható
                  </Button>
                </div>
              </>
            )}
            {suggestions.length === 0 && exactMatch && (
              <div className="px-3 py-2 text-xs text-[var(--ui-text-muted)]">Már hozzá van adva</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
