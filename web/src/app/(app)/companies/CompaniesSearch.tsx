"use client";

import { Suspense, useCallback, useState } from "react";
import { useRouter, usePathname, useSearchParams } from "next/navigation";
import { Input } from "@/components/ui/input";

interface CompaniesSearchProps {
  search: string;
  includeFA: boolean;
}

function CompaniesSearchInner({ search, includeFA }: CompaniesSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [value, setValue] = useState(search);

  // Preserve every other active filter param; only touch search / fa / page.
  const push = useCallback(
    (newSearch: string, newFA: boolean) => {
      const params = new URLSearchParams(searchParams.toString());
      if (newSearch) params.set("search", newSearch);
      else params.delete("search");
      if (newFA) params.set("fa", "1");
      else params.delete("fa");
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, searchParams]
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

export function CompaniesSearch(props: CompaniesSearchProps) {
  return (
    <Suspense fallback={null}>
      <CompaniesSearchInner {...props} />
    </Suspense>
  );
}
