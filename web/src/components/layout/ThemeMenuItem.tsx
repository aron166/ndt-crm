"use client";

import { useEffect, useState, useTransition } from "react";
import { Moon, Sun } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { setTheme } from "@/app/actions/theme";
import type { Theme } from "@/lib/theme";

// HU strings: proposals, unreviewed (Áron).
const LABEL: Record<Theme, string> = {
  dark: "Világos mód",
  light: "Sötét mód",
};

/**
 * Theme toggle in the user menu.
 *
 * It reads the current theme off <html data-theme> rather than taking a prop,
 * because the root layout already rendered the truth there — one source, no
 * plumbing through AppShell. The attribute is flipped locally first so the
 * change is instant; the server action then persists it on the users row,
 * which is what carries the choice to the next device.
 */
export function ThemeMenuItem() {
  const [theme, setThemeState] = useState<Theme>("dark");
  const [pending, startTransition] = useTransition();

  useEffect(() => {
    setThemeState(document.documentElement.dataset.theme === "light" ? "light" : "dark");
  }, []);

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    setThemeState(next);
    startTransition(async () => {
      const res = await setTheme(next);
      if (res && "error" in res) {
        // Persisting failed; don't leave the user looking at a theme that
        // will be gone on the next load.
        document.documentElement.dataset.theme = theme;
        setThemeState(theme);
      }
    });
  }

  return (
    <DropdownMenuItem className="gap-2" disabled={pending} onClick={toggle}>
      {theme === "light" ? <Moon className="size-4" /> : <Sun className="size-4" />}
      {LABEL[theme]}
    </DropdownMenuItem>
  );
}
