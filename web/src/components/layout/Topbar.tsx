"use client";

import { useState } from "react";
import { useRouter, usePathname } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { TaskModal } from "@/app/(app)/tasks/TaskModal";
import { DealModal } from "@/app/(app)/deals/DealModal";
import { LogOut, User, Plus, Bell, Search, ChevronDown } from "lucide-react";

// ── Breadcrumb labels ─────────────────────────────────────────
const CRUMB: Record<string, string> = {
  "/":          "Dashboard",
  "/tasks":     "Feladatok",
  "/persons":   "Személyek",
  "/companies": "Cégek",
  "/deals":     "Pipeline",
  "/invoices":  "Számlák",
  "/settings":  "Beállítások",
  "/analytics": "Analytics",
};

function useCrumb(pathname: string) {
  const segments = pathname.split("/").filter(Boolean);
  if (segments.length === 0) return [{ label: "Dashboard", href: "/" }];

  const crumbs: { label: string; href: string }[] = [];
  let path = "";
  for (const seg of segments) {
    path += "/" + seg;
    const label = CRUMB[path] ?? (seg.match(/^\d+$/) ? `#${seg}` : seg);
    crumbs.push({ label, href: path });
  }
  return crumbs;
}

// ── Signal bars (live sync indicator) ────────────────────────
function SignalBars() {
  return (
    <div className="flex items-end gap-[2px]" style={{ height: 14, width: 20 }}>
      {[30, 55, 80, 100, 70].map((h, i) => (
        <span
          key={i}
          className="flex-1 rounded-[1px]"
          style={{
            height: `${h}%`,
            background: "var(--mint)",
            animation: `sigpulse 1.6s ease-in-out ${i * 0.2}s infinite`,
          }}
        />
      ))}
    </div>
  );
}

interface PipelineStub {
  id: number;
  stages: { id: number; name: string; color: string; isTerminalWon: boolean; isTerminalLost: boolean; probability: number; position: number }[];
  customFields: { id: number; key: string; label: string; type: string; required: boolean; options: unknown }[];
}

interface TopbarProps {
  collapsed: boolean;
  email: string;
  defaultPipeline: PipelineStub | null;
  onSearchOpen: () => void;
}

export function Topbar({ collapsed, email, defaultPipeline, onSearchOpen }: TopbarProps) {
  const router = useRouter();
  const pathname = usePathname();
  const crumbs = useCrumb(pathname);
  const [taskOpen, setTaskOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  const [newMenuOpen, setNewMenuOpen] = useState(false);

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = email.split("@")[0].slice(0, 2).toUpperCase();

  return (
    <>
      <TaskModal open={taskOpen} onClose={() => { setTaskOpen(false); router.refresh(); }} />
      {defaultPipeline && (
        <DealModal
          open={dealOpen}
          onClose={() => { setDealOpen(false); router.refresh(); }}
          pipeline={defaultPipeline}
        />
      )}

      <header
        className="fixed top-0 right-0 z-20 flex items-center gap-4 px-6 transition-all duration-200"
        style={{
          left: collapsed ? "3.5rem" : "240px",
          height: 60,
          background: "oklch(0.155 0.012 255 / 0.85)",
          backdropFilter: "blur(12px)",
          borderBottom: "1px solid var(--line-soft)",
        }}
      >
        {/* Breadcrumbs */}
        <nav className="flex items-center gap-2 text-sm" style={{ color: "var(--fg-mute)" }}>
          <span style={{ color: "var(--fg-faint)" }}>Helm CRM</span>
          {crumbs.map((c, i) => (
            <span key={c.href} className="flex items-center gap-2">
              <span style={{ color: "var(--fg-faint)" }}>/</span>
              <span
                style={{
                  color: i === crumbs.length - 1 ? "var(--fg)" : "var(--fg-mute)",
                  fontWeight: i === crumbs.length - 1 ? 500 : 400,
                }}
              >
                {c.label}
              </span>
            </span>
          ))}
        </nav>

        {/* ⌘K command bar — click to open palette */}
        <button
          onClick={onSearchOpen}
          className="flex-1 max-w-sm mx-auto flex items-center gap-2.5 px-3 rounded-lg transition-colors"
          style={{
            height: 34,
            background: "var(--bg-panel)",
            border: "1px solid var(--line-soft)",
            fontSize: 13,
            color: "var(--fg-mute)",
            cursor: "text",
          }}
          onMouseOver={(e) => (e.currentTarget.style.borderColor = "var(--line)")}
          onMouseOut={(e) => (e.currentTarget.style.borderColor = "var(--line-soft)")}
        >
          <Search style={{ width: 13, height: 13, opacity: 0.6 }} />
          <span>Ugrás személyhez, céghez, feladathoz...</span>
          <span
            className="ml-auto font-mono-ndt rounded"
            style={{
              fontSize: 10, padding: "1px 5px",
              background: "var(--bg-raised)",
              border: "1px solid var(--line-soft)",
              color: "var(--fg-mute)",
            }}
          >
            ⌘K
          </span>
        </button>

        {/* Right cluster */}
        <div className="flex items-center gap-2">
          {/* Live sync signal */}
          <div title="Live · Supabase synced">
            <SignalBars />
          </div>

          {/* Bell */}
          <button
            className="flex items-center justify-center rounded transition-colors"
            style={{ width: 34, height: 34, color: "var(--fg-soft)", border: "1px solid transparent" }}
            onMouseOver={(e) => {
              e.currentTarget.style.background = "var(--bg-panel)";
              e.currentTarget.style.borderColor = "var(--line-soft)";
            }}
            onMouseOut={(e) => {
              e.currentTarget.style.background = "transparent";
              e.currentTarget.style.borderColor = "transparent";
            }}
          >
            <Bell className="size-4" />
          </button>

          {/* + New split button */}
          <div className="flex items-stretch" style={{ borderRadius: 6, overflow: "hidden" }}>
            <button
              onClick={() => setTaskOpen(true)}
              className="flex items-center gap-1.5 font-medium transition-all"
              style={{
                height: 32, padding: "0 12px", fontSize: 13,
                background: "linear-gradient(180deg, var(--indigo), var(--indigo-dim))",
                color: "white", border: "1px solid var(--indigo-dim)",
                borderRight: "none", borderRadius: "6px 0 0 6px",
                boxShadow: "0 0 0 1px oklch(0.66 0.19 278 / 0.3), 0 4px 14px -4px oklch(0.66 0.19 278 / 0.6)",
              }}
              onMouseOver={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
              onMouseOut={(e) => (e.currentTarget.style.filter = "none")}
            >
              <Plus className="size-3.5" />
              Feladat
            </button>
            <div style={{ width: 1, background: "oklch(0.56 0.18 278)" }} />
            <button
              onClick={() => defaultPipeline ? setDealOpen(true) : router.push("/deals/setup")}
              className="flex items-center gap-1 font-medium transition-all"
              style={{
                height: 32, padding: "0 8px", fontSize: 13,
                background: "linear-gradient(180deg, var(--indigo), var(--indigo-dim))",
                color: "white", border: "1px solid var(--indigo-dim)",
                borderLeft: "none", borderRadius: "0 6px 6px 0",
                boxShadow: "0 0 0 1px oklch(0.66 0.19 278 / 0.3), 0 4px 14px -4px oklch(0.66 0.19 278 / 0.6)",
              }}
              title="Új deal"
              onMouseOver={(e) => (e.currentTarget.style.filter = "brightness(1.1)")}
              onMouseOut={(e) => (e.currentTarget.style.filter = "none")}
            >
              Deal
            </button>
          </div>

          {/* User menu */}
          <DropdownMenu>
            <DropdownMenuTrigger
              className="flex items-center gap-2 px-2 py-1 rounded-lg transition-colors"
              style={{ color: "var(--fg-soft)" }}
              onMouseOver={(e) => (e.currentTarget.style.background = "var(--bg-panel)")}
              onMouseOut={(e) => (e.currentTarget.style.background = "transparent")}
            >
              <span
                className="flex items-center justify-center rounded-full text-xs font-semibold font-mono-ndt shrink-0"
                style={{
                  width: 28, height: 28,
                  background: "var(--indigo)",
                  color: "white",
                  boxShadow: "0 0 0 2px oklch(0.66 0.19 278 / 0.25)",
                }}
              >
                {initials}
              </span>
              <span className="text-sm hidden sm:block" style={{ color: "var(--fg-mute)" }}>
                {email}
              </span>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-48">
              <DropdownMenuItem className="gap-2">
                <User className="size-4" />
                Profil
              </DropdownMenuItem>
              <DropdownMenuSeparator />
              <DropdownMenuItem
                className="gap-2 text-red-400 focus:text-red-400"
                onClick={handleSignOut}
              >
                <LogOut className="size-4" />
                Kijelentkezés
              </DropdownMenuItem>
            </DropdownMenuContent>
          </DropdownMenu>
        </div>
      </header>
    </>
  );
}
