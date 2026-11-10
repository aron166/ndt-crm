"use client";

import { Suspense } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { X } from "lucide-react";
import k from "@/components/astryx/page.module.css";
import s from "./companies.module.css";

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
      // The parser accepts both repeated AND comma-joined params — flatten both.
      const remaining = params
        .getAll(chip.param)
        .flatMap((raw) => raw.split(","))
        .map((part) => part.trim())
        .filter((v) => v && v !== chip.value);
      params.delete(chip.param);
      if (remaining.length) params.set(chip.param, remaining.join(","));
    }
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }

  function clearAll() {
    router.push(pathname);
  }

  return (
    <div className="flex flex-wrap items-center gap-2 mb-4" style={{ fontSize: 14 }}>
      <span className={k.muted}>Szűrő:</span>
      {chips.map((chip, i) => (
        <button
          key={`${chip.param}-${chip.value ?? "flag"}-${i}`}
          type="button"
          onClick={() => removeChip(chip)}
          className={`${s.chip} ${s.chipBtn}`}
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
          className={s.linkBtn}
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
