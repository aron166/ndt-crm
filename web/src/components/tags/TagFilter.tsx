"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { TagChip } from "./TagChip";
import { Tag } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { DEFAULT_DATA_COLOR } from "@/lib/data-colors";

interface TagOption { id: number; name: string; color: string; }
interface TagFilterProps { activeTagName?: string; }

// Inner component uses useSearchParams — must be wrapped in Suspense
function TagFilterInner({ activeTagName }: TagFilterProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<TagOption[]>([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    fetch(`/api/search/tags?q=${encodeURIComponent(query)}`)
      .then((r) => r.json())
      .then(setOptions);
  }, [query, open]);

  function applyTag(name: string) {
    const params = new URLSearchParams(searchParams.toString());
    params.set("tag", name);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
    setOpen(false);
    setQuery("");
  }

  function clearTag() {
    const params = new URLSearchParams(searchParams.toString());
    params.delete("tag");
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  if (activeTagName) {
    return (
      <div className="flex items-center gap-2">
        <span className="text-xs" style={{ color: "var(--ui-text-muted)" }}>Szűrés:</span>
        <TagChip name={activeTagName} color={DEFAULT_DATA_COLOR} onRemove={clearTag} />
      </div>
    );
  }

  return (
    <div className="relative">
      <Button type="button" variant="outline" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <Tag className="size-3.5" />
        Tag szűrő
      </Button>

      {open && (
        <div className="absolute z-50 mt-1 w-56" style={{ background: "var(--ui-surface-overlay)", borderRadius: "var(--ui-radius-surface)", boxShadow: "var(--ui-shadow-overlay)" }}>
          <div className="p-2" style={{ borderBottom: "1px solid var(--ui-border)" }}>
            <Input
              autoFocus
              type="text"
              placeholder="Tag keresése..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {options.length === 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: "var(--ui-text-muted)" }}>Nincs tag</p>
            )}
            {options.map((t) => (
              <Button
                key={t.id}
                type="button"
                variant="ghost"
                size="sm"
                onClick={() => applyTag(t.name)}
                className="w-full justify-start font-normal"
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                {t.name}
              </Button>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// Exported component wraps inner in Suspense (required for useSearchParams)
export function TagFilter(props: TagFilterProps) {
  return (
    <Suspense fallback={null}>
      <TagFilterInner {...props} />
    </Suspense>
  );
}
