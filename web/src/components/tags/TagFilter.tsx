"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";
import { TagChip } from "./TagChip";
import { Tag } from "lucide-react";

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
        <span className="text-xs" style={{ color: "var(--fg-faint)" }}>Szűrés:</span>
        <TagChip name={activeTagName} color="#6366f1" onRemove={clearTag} />
      </div>
    );
  }

  return (
    <div className="relative">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg text-xs transition-colors"
        style={{ border: "1px solid var(--line-soft)", color: "var(--fg-mute)", background: "transparent" }}
      >
        <Tag className="size-3.5" />
        Tag szűrő
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-56 rounded-lg shadow-md" style={{ border: "1px solid var(--line-soft)", background: "var(--bg-panel)" }}>
          <div className="p-2" style={{ borderBottom: "1px solid var(--line-soft)" }}>
            <input
              autoFocus
              type="text"
              placeholder="Tag keresése..."
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              className="w-full text-xs px-2 py-1 rounded outline-none"
              style={{ border: "1px solid var(--line-soft)", background: "var(--bg-raised)", color: "var(--fg)" }}
            />
          </div>
          <div className="max-h-48 overflow-y-auto py-1">
            {options.length === 0 && (
              <p className="px-3 py-2 text-xs" style={{ color: "var(--fg-faint)" }}>Nincs tag</p>
            )}
            {options.map((t) => (
              <button
                key={t.id}
                type="button"
                onClick={() => applyTag(t.name)}
                className="flex items-center gap-2 w-full px-3 py-1.5 text-xs"
                style={{ color: "var(--fg-soft)" }}
              >
                <span className="w-2.5 h-2.5 rounded-full shrink-0" style={{ backgroundColor: t.color }} />
                {t.name}
              </button>
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
