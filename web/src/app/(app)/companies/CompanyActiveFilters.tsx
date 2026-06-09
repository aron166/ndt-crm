"use client";

import { Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";

export interface ActiveChip {
  /** URL param this value lives in (comma-joined for multi). */
  param: string;
  /** The raw value to remove; omit for boolean flags (whole param dropped). */
  value?: string;
  label: string;
}

function CompanyActiveFiltersInner({ chips }: { chips: ActiveChip[] }) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  if (chips.length === 0) return null;

  function removeChip(chip: ActiveChip) {
    const params = new URLSearchParams(searchParams.toString());
    if (chip.value === undefined) {
      params.delete(chip.param);
    } else {
      const remaining = (params.get(chip.param) ?? "")
        .split(",").map((s) => s.trim()).filter((v) => v && v !== chip.value);
      if (remaining.length) params.set(chip.param, remaining.join(","));
      else params.delete(chip.param);
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4" style={{ fontSize: 12 }}>
      <span style={{ color: "var(--fg-faint)" }}>Szűrő:</span>
      {chips.map((chip, i) => (
        <button
          key={`${chip.param}-${chip.value ?? "flag"}-${i}`}
          type="button"
          onClick={() => removeChip(chip)}
          className="flex items-center gap-1 rounded-full px-2 py-0.5 transition-colors"
          style={{
            background: "var(--indigo-soft)", color: "var(--indigo)",
            fontSize: 11, fontFamily: "var(--font-mono)",
          }}
          title="Eltávolítás"
        >
          {chip.label}
          <X className="size-3" />
        </button>
      ))}
      {chips.length > 1 && (
        <button
          type="button"
          onClick={clearAll}
          style={{ color: "var(--fg-faint)", fontSize: 11, marginLeft: 2 }}
        >
          × mind törlése
        </button>
      )}
    </div>
  );
}

export function CompanyActiveFilters({ chips }: { chips: ActiveChip[] }) {
  return (
    <Suspense fallback={null}>
      <CompanyActiveFiltersInner chips={chips} />
    </Suspense>
  );
}
