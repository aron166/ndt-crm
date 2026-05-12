"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { StatusBar } from "./StatusBar";
import { CommandPalette } from "@/components/CommandPalette";
import { cn } from "@/lib/utils";

interface PipelineStub {
  id: number;
  name: string;
  stages: { id: number; name: string; color: string; isTerminalWon: boolean; isTerminalLost: boolean; probability: number; position: number }[];
}

interface AppShellProps {
  children: React.ReactNode;
  email: string;
  overdueCount?: number;
  defaultPipeline?: PipelineStub | null;
}

export function AppShell({ children, email, overdueCount = 0, defaultPipeline }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);

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
      <Sidebar collapsed={collapsed} onToggle={setCollapsed} />
      <Topbar
        collapsed={collapsed}
        email={email}
        defaultPipeline={defaultPipeline ?? null}
        onSearchOpen={() => setSearchOpen(true)}
      />

      <main
        className={cn(
          "relative z-10 transition-all duration-200",
          collapsed ? "pl-14" : "pl-[240px]"
        )}
        style={{ paddingTop: 60, paddingBottom: 26, height: "100dvh", overflowY: "auto" }}
      >
        <div className="max-w-[1400px] mx-auto px-6 py-6">
          {children}
        </div>
      </main>

      <StatusBar collapsed={collapsed} overdueCount={overdueCount} />

      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </>
  );
}
