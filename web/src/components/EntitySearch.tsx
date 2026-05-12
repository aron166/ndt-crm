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
        <ul className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-md max-h-48 overflow-y-auto">
          {options.map((opt) => (
            <li key={opt.id}>
              <button
                type="button"
                className="w-full text-left px-3 py-2 text-sm hover:bg-slate-50 flex items-center gap-2"
                onClick={() => handleSelect(opt)}
              >
                <span className="flex-1 truncate">{opt.label}</span>
                {opt.sub && <span className="text-xs text-slate-400 shrink-0 truncate max-w-[120px]">{opt.sub}</span>}
              </button>
            </li>
          ))}
        </ul>
      )}
      {open && !loading && options.length === 0 && query.length > 1 && (
        <div className="absolute z-50 mt-1 w-full rounded-lg border border-slate-200 bg-white shadow-md px-3 py-2 text-sm text-slate-400">
          Nincs találat
        </div>
      )}
    </div>
  );
}
