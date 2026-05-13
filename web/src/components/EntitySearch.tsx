"use client";

import { useState, useEffect, useRef } from "react";
import { cn } from "@/lib/utils";
import { X } from "lucide-react";

interface Option {
  id: number;
  label: string;
  sub?: string;
}

interface EntitySearchProps {
  endpoint: string; // e.g. /api/search/companies
  placeholder: string;
  value: Option | null;
  onChange: (val: Option | null) => void;
  disabled?: boolean;
}

export function EntitySearch({
  endpoint,
  placeholder,
  value,
  onChange,
  disabled,
}: EntitySearchProps) {
  const [query, setQuery] = useState("");
  const [options, setOptions] = useState<Option[]>([]);
  const [open, setOpen] = useState(false);
  const [loading, setLoading] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    }
    document.addEventListener("mousedown", onClickOutside);
    return () => document.removeEventListener("mousedown", onClickOutside);
  }, []);

  function handleInput(e: React.ChangeEvent<HTMLInputElement>) {
    const q = e.target.value;
    setQuery(q);
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!q.trim()) { setOptions([]); setOpen(false); return; }
    timerRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(`${endpoint}?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setOptions(data);
        setOpen(true);
      } finally {
        setLoading(false);
      }
    }, 200);
  }

  function handleSelect(opt: Option) {
    onChange(opt);
    setQuery("");
    setOptions([]);
    setOpen(false);
  }

  function handleClear() {
    onChange(null);
    setQuery("");
  }

  if (value) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg border border-input bg-transparent text-sm">
        <span className="flex-1 truncate">{value.label}</span>
        {value.sub && <span className="text-xs text-slate-400 shrink-0">{value.sub}</span>}
        {!disabled && (
          <button type="button" onClick={handleClear} className="text-slate-400 hover:text-slate-700 shrink-0">
            <X className="size-3.5" />
          </button>
        )}
      </div>
    );
  }

  return (
    <div ref={containerRef} className="relative">
      <input
        type="text"
        value={query}
        onChange={handleInput}
        placeholder={placeholder}
        disabled={disabled}
        className={cn(
          "flex h-8 w-full rounded-lg border border-input bg-transparent px-3 py-1 text-sm outline-none placeholder:text-muted-foreground focus:border-ring focus:ring-3 focus:ring-ring/50 disabled:opacity-50"
        )}
      />
      {loading && (
        <span className="absolute right-2 top-2 text-xs text-slate-400">...</span>
      )}
      {open && options.length > 0 && (
        <ul style={{ position: "absolute", zIndex: 50, marginTop: 4, width: "100%", borderRadius: 8, border: "1px solid var(--line-soft)", background: "var(--bg-panel)", boxShadow: "0 8px 24px oklch(0 0 0 / 0.4)", maxHeight: 200, overflowY: "auto", listStyle: "none", padding: 0, margin: "4px 0 0" }}>
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                style={{ width: "100%", textAlign: "left", padding: "7px 12px", fontSize: 13, color: "var(--fg-soft)", background: "none", border: "none", cursor: "pointer", display: "flex", alignItems: "center", gap: 8, transition: "background .1s" }}
                onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-hover)")}
                onMouseOut={(e) => (e.currentTarget.style.background = "none")}
                onClick={() => handleSelect(opt)}
              >
                <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.label}</span>
                {opt.sub && <span style={{ fontSize: 11, color: "var(--fg-faint)", flexShrink: 0, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{opt.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && options.length === 0 && query.length > 1 && (
        <div style={{ position: "absolute", zIndex: 50, marginTop: 4, width: "100%", borderRadius: 8, border: "1px solid var(--line-soft)", background: "var(--bg-panel)", padding: "8px 12px", fontSize: 12, color: "var(--fg-faint)" }}>
          Nincs találat
        </div>
      )}
    </div>
  );
}
