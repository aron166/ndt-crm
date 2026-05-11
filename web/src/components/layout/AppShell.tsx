"use client";

import { useState, useEffect } from "react";
import { Sidebar } from "./Sidebar";
import { Topbar } from "./Topbar";
import { cn } from "@/lib/utils";

interface AppShellProps {
  children: React.ReactNode;
  email: string;
}

export function AppShell({ children, email }: AppShellProps) {
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
          "pt-14 min-h-screen bg-slate-50 transition-all duration-200",
          collapsed ? "pl-14" : "pl-60"
        )}
      >
        <div className="max-w-[1280px] mx-auto p-6">{children}</div>
      </main>
    </>
  );
}
