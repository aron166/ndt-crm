"use client";

import { useState, useSyncExternalStore, useTransition } from "react";
import { Moon, Sun } from "lucide-react";
import { DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { setTheme } from "@/app/actions/theme";
import type { Theme } from "@/lib/theme";

// HU strings: proposals, unreviewed (Áron).
const LABEL: Record<Theme, string> = {
  dark: "Világos mód",
  light: "Sötét mód",
};

// Read <html data-theme> after hydration without a mismatch — the same
// useSyncExternalStore idiom the login page uses for its ?denied flag. The
// attribute never changes on its own, so there is nothing to subscribe to.
const noSubscribe = () => () => {};
const readDom = (): Theme =>
  document.documentElement.dataset.theme === "light" ? "light" : "dark";
const readServer = (): Theme => "dark";

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
  const domTheme = useSyncExternalStore(noSubscribe, readDom, readServer);
  // Set only from the click handler, so the menu label follows the flip
  // before the server action lands.
  const [override, setOverride] = useState<Theme | null>(null);
  const [pending, startTransition] = useTransition();
  const theme = override ?? domTheme;

  function toggle() {
    const next: Theme = theme === "light" ? "dark" : "light";
    document.documentElement.dataset.theme = next;
    setOverride(next);
    startTransition(async () => {
      // A returned { error } and a THROWN action (connection reset mid-submit,
      // a Prisma error) both have to roll back, or the user browses in a theme
      // the database does not have until the next full document load.
      let ok = false;
      try {
        ok = !("error" in (await setTheme(next)));
      } catch {
        ok = false;
      }
      if (!ok) {
        document.documentElement.dataset.theme = theme;
        setOverride(theme);
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
