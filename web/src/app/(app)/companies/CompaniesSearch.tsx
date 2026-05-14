"use client";

import { useRouter, usePathname } from "next/navigation";
import { useCallback, useState } from "react";
import { Input } from "@/components/ui/input";
import { CreateCompanyModal } from "@/components/CreateCompanyModal";

interface CompaniesSearchProps {
  search: string;
  includeFA: boolean;
  neverContacted?: boolean;
  pipelineStatus?: string;
}

export function CompaniesSearch({ search, includeFA, neverContacted, pipelineStatus }: CompaniesSearchProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(search);
  const [createOpen, setCreateOpen] = useState(false);

  const push = useCallback(
    (newSearch: string, newFA: boolean) => {
      const params = new URLSearchParams();
      if (newSearch) params.set("search", newSearch);
      if (newFA) params.set("fa", "1");
      params.set("page", "1");
      if (neverContacted) params.set("never_contacted", "1");
      if (pipelineStatus) params.set("pipeline_status", pipelineStatus);
      router.push(`${pathname}?${params.toString()}`);
    },
    [router, pathname, neverContacted, pipelineStatus]
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
    <>
      <CreateCompanyModal open={createOpen} onClose={() => setCreateOpen(false)} />
    <div className="flex items-center gap-3">
      <button className="btn primary" onClick={() => setCreateOpen(true)}>+ Új cég</button>
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
    </>
  );
}
