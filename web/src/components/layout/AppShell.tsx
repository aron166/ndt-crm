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
  // Phones (< 768 px): the reading pane gets the full width (content approval
  // spec §4) — sidebar becomes a drawer, status bar is hidden.
  const narrow = useSyncExternalStore(subscribeNarrow, isNarrow, () => false);
  // Phones: no rail at all — the sidebar is an off-canvas drawer (Kai, #100 review).
  const [drawerOpen, setDrawerOpen] = useState(false);
  // Layout for phones is pure CSS (max-md: classes) so the first paint is right;
  // `narrow` only drives drawer behaviour after hydration.
  const isCollapsed = collapsed;

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
      {narrow && drawerOpen && (
        <div
          aria-hidden
          onClick={() => setDrawerOpen(false)}
          style={{ position: "fixed", inset: 0, zIndex: 40, background: "var(--overlay)" }}
        />
      )}
      <Sidebar
        collapsed={isCollapsed}
        onToggle={setCollapsed}
        badges={{ "/marketing": marketingReviewCount }}
        mobile={{ open: narrow && drawerOpen, onClose: () => setDrawerOpen(false), active: narrow }}
      />
      <Topbar
        collapsed={isCollapsed}
        onMenu={() => setDrawerOpen(true)}
        email={email}
        defaultPipeline={defaultPipeline ?? null}
        onSearchOpen={() => setSearchOpen(true)}
      />

      <main
        className={cn(
          "relative z-10 transition-all duration-200 pb-[26px] max-md:pb-0",
          isCollapsed ? "pl-14" : "pl-[240px]",
          "max-md:!pl-0"
        )}
        style={{ paddingTop: 60, height: "100dvh", overflowY: "auto" }}
      >
        <div className="max-w-[1400px] mx-auto px-4 py-4 md:px-6 md:py-6">
          {children}
        </div>
      </main>

      <div className="max-md:hidden">
        <StatusBar collapsed={isCollapsed} overdueCount={overdueCount} />
      </div>

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
