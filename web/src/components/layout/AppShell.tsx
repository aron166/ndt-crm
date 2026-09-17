"use client";

import { useState, useEffect, useSyncExternalStore } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "@/components/CommandPalette";
import { cn } from "@/lib/utils";

interface PipelineStub {
  id: number;
  name: string;
  stages: { id: number; name: string; color: string; isTerminalWon: boolean; isTerminalLost: boolean; probability: number; position: number }[];
  customFields: { id: number; key: string; label: string; type: string; required: boolean; options: unknown }[];
}

interface AppShellProps {
  children: React.ReactNode;
  email: string;
  overdueCount?: number;
  marketingReviewCount?: number;
  defaultPipeline?: PipelineStub | null;
}

const NARROW_QUERY = "(max-width: 767px)";
function subscribeNarrow(onChange: () => void) {
  const mq = window.matchMedia(NARROW_QUERY);
  mq.addEventListener("change", onChange);
  return () => mq.removeEventListener("change", onChange);
}
function isNarrow() {
  return window.matchMedia(NARROW_QUERY).matches;
}

export function AppShell({ children, email, overdueCount = 0, marketingReviewCount = 0, defaultPipeline }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  // Phones: always the 56 px icon rail — the 240 px sidebar left ~150 px for
  // content at 390 px (content approval spec §4: fully usable on phone).
  // ponytail: rail, not a drawer; add an off-canvas menu if the rail gets crowded.
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  const isCollapsed = collapsed || narrow;

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored) setCollapsed(stored === "true");
  }, []);

  // ⌘K / Ctrl+K global shortcut
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if ((e.metaKey || e.ctrlKey) && e.key === "k") {
        e.preventDefault();
        setSearchOpen((v) => !v);
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return (
    <>
      <Sidebar collapsed={isCollapsed} onToggle={setCollapsed} badges={{ "/marketing": marketingReviewCount }} />
      <Topbar
        collapsed={isCollapsed}
        email={email}
        defaultPipeline={defaultPipeline ?? null}
        onSearchOpen={() => setSearchOpen(true)}
      />

      <main
        className={cn(
          "relative z-10 transition-all duration-200",
          isCollapsed ? "pl-14" : "pl-[240px]"
        )}
        style={{ paddingTop: 60, paddingBottom: 26, height: "100dvh", overflowY: "auto" }}
      >
        <div className="max-w-[1400px] mx-auto px-4 py-4 md:px-6 md:py-6">
          {children}
        </div>
      </main>

      <StatusBar collapsed={isCollapsed} overdueCount={overdueCount} />

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
