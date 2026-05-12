"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { StatusBar } from "./StatusBar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  email: string;
  overdueCount?: number;
}

export function AppShell({ children, email, overdueCount = 0 }: AppShellProps) {
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    const stored = localStorage.getItem("sidebar-collapsed");
    if (stored) setCollapsed(stored === "true");
  }, []);

  return (
    <>
      <Sidebar collapsed={collapsed} onToggle={setCollapsed} />
      <Topbar collapsed={collapsed} email={email} />

      <main
        className={cn(
          "relative z-10 transition-all duration-200 overflow-y-auto",
          collapsed ? "pl-14" : "pl-[240px]"
        )}
        style={{ paddingTop: 60, paddingBottom: 26, minHeight: "100vh" }}
      >
        <div className="max-w-[1400px] mx-auto px-6 py-6">
          {children}
        </div>
      </main>

      <StatusBar collapsed={collapsed} overdueCount={overdueCount} />
    </>
  );
}
