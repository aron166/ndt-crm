"use client";

import { useRouter, usePathname } from "next/navigation";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { useDebouncedCallback } from "@/lib/use-debounced-callback";

export function PersonsSearch({ search }: { search: string }) {
  const router = useRouter();
  const pathname = usePathname();
  const [value, setValue] = useState(search);

  const [debouncedPush] = useDebouncedCallback((v: string) => {
    const params = new URLSearchParams();
    if (v) params.set("search", v);
    params.set("page", "1");
    router.push(`${pathname}?${params.toString()}`);
  }, 300);

  function handleChange(e: React.ChangeEvent<HTMLInputElement>) {
    setValue(e.target.value);
    debouncedPush(e.target.value);
  }

  return (
    <Input
      placeholder="Keresés név, email, telefon..."
      value={value}
      onChange={handleChange}
      className="max-w-sm"
    />
  );
}
