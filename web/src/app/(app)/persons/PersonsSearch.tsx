"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { CreatePersonModal } from "@/components/CreatePersonModal";

export function PersonsSearch({ search }: { search: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(search);
  const [createOpen, setCreateOpen] = useState(false);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    clearTimeout((window as unknown as { _searchTimer: ReturnType<typeof setTimeout> })._searchTimer);
    (window as unknown as { _searchTimer: ReturnType<typeof setTimeout> })._searchTimer = setTimeout(() => {
      const params = new URLSearchParams();
      if (e.target.value) params.set("search", e.target.value);
      params.set("page", "1");
      router.push(`${pathname}?${params.toString()}`);
    }, 300);
  }

  return (
    <>
      <CreatePersonModal open={createOpen} onClose={() => setCreateOpen(false)} />
      <div className="flex items-center gap-3">
        <button className="btn primary" onClick={() => setCreateOpen(true)}>+ Új személy</button>
        <Input
          placeholder="Keresés név, email, telefon..."
          value={value}
          onChange={handleChange}
          className="max-w-sm"
        />
      </div>
    </>
  );
}
