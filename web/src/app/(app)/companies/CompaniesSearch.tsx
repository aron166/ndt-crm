"use client";

import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";

interface CompaniesSearchProps {
  search: string;
  includeFA: boolean;
}

export function CompaniesSearch({ search, includeFA }: CompaniesSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const currentParams = useSearchParams();
  const [value, setValue] = useState(search);

  const push = useCallback(
    (newSearch: string, newFA: boolean) => {
      const params = new URLSearchParams();
      if (newSearch) params.set("search", newSearch);
      if (newFA) params.set("fa", "1");
      params.set("page", "1");
      // preserve drill-through filters set by analytics
      const neverContacted = currentParams.get("never_contacted");
      const pipelineStatus = currentParams.get("pipeline_status");
      if (neverContacted) params.set("never_contacted", neverContacted);
      if (pipelineStatus) params.set("pipeline_status", pipelineStatus);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, currentParams]
  );

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    clearTimeout((window as unknown as { _searchTimer: ReturnType<typeof setTimeout> })._searchTimer);
    (window as unknown as { _searchTimer: ReturnType<typeof setTimeout> })._searchTimer = setTimeout(
      () => push(e.target.value, includeFA),
      300
    );
  }

  return (
    <div className="flex items-center gap-3">
      <Input
        placeholder="Keresés cég neve, adószám, város..."
        value={value}
        onChange={handleChange}
        className="max-w-sm"
      />
      <label className="flex items-center gap-2 text-sm text-slate-600 cursor-pointer">
        <input
          type="checkbox"
          checked={includeFA}
          onChange={(e) => push(value, e.target.checked)}
          className="rounded"
        />
        F.A. cégek
      </label>
    </div>
  );
}
