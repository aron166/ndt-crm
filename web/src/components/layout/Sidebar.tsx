"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

// ── Icons (inline SVG matching the redesign) ──────────────────
function IconDashboard() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="9"/><rect x="14" y="3" width="7" height="5"/>
      <rect x="14" y="12" width="7" height="9"/><rect x="3" y="16" width="7" height="5"/>
    </svg>
  );
}
function IconPersons() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/>
      <path d="M22 21v-2a4 4 0 0 0-3-3.87"/><path d="M16 3.13a4 4 0 0 1 0 7.75"/>
    </svg>
  );
}
function IconBuilding() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="4" y="2" width="16" height="20" rx="1.5"/>
      <path d="M9 7h2M13 7h2M9 11h2M13 11h2M9 15h2M13 15h2"/>
      <path d="M10 22v-4h4v4"/>
    </svg>
  );
}
function IconTasks() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <rect x="3" y="3" width="7" height="18" rx="1"/><rect x="14" y="3" width="7" height="11" rx="1"/>
    </svg>
  );
}
function IconPipe() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 6h18l-4 6 4 6H3"/>
    </svg>
  );
}
function IconLeads() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M3 11l19-9-9 19-2-8-8-2z"/>
    </svg>
  );
}
function IconInvoice() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/>
      <path d="M14 2v6h6M8 13h8M8 17h5"/>
    </svg>
  );
}
function IconAnalytics() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/>
    </svg>
  );
}
function IconSettings() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="3"/>
      <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.62a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9c.36.15.69.35 1 .6.31.25.6.55.85.85.25.31.45.64.6 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/>
    </svg>
  );
}
function IconSparkle() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M12 3l1.5 4.5L18 9l-4.5 1.5L12 15l-1.5-4.5L6 9l4.5-1.5z"/>
      <path d="M19 15l.75 2.25L22 18l-2.25.75L19 21l-.75-2.25L16 18l2.25-.75z"/>
      <path d="M5 3l.5 1.5L7 5l-1.5.5L5 7l-.5-1.5L3 5l1.5-.5z"/>
    </svg>
  );
}

function IconZap() {
  return (
    <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round">
      <path d="M13 2L3 14h9l-1 8 10-12h-9l1-8z"/>
    </svg>
  );
}

const NAV = [
  {
    group: "WORKSPACE",
    items: [
      { href: "/",          label: "Dashboard",  icon: IconDashboard },
      { href: "/tasks",     label: "Feladatok",  icon: IconTasks },
    ],
  },
  {
    group: "KAPCSOLATOK",
    items: [
      { href: "/persons",   label: "Személyek", icon: IconPersons },
      { href: "/companies", label: "Cégek",     icon: IconBuilding },
      { href: "/leads",     label: "Leadek",    icon: IconLeads },
      { href: "/deals",     label: "Pipeline",  icon: IconPipe },
    ],
  },
  {
    group: "ÜZEMELTETÉS",
    items: [
      { href: "/invoices",    label: "Számlák",     icon: IconInvoice },
      { href: "/analytics",   label: "Analytics",   icon: IconAnalytics },
      { href: "/enrichment",  label: "Enrichment",  icon: IconSparkle },
      { href: "/automations", label: "Automatizálás", icon: IconZap },
      { href: "/settings",    label: "Beállítások", icon: IconSettings },
    ],
  },
];

interface SidebarProps {
  collapsed: boolean;
  onToggle: (collapsed: boolean) => void;
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  const pathname = usePathname();

  function toggle() {
    const next = !collapsed;
    onToggle(next);
    localStorage.setItem("sidebar-collapsed", String(next));
  }

  return (
    <aside
      style={{ background: "var(--bg-sidebar)", borderRight: "1px solid var(--line-soft)" }}
      className={cn(
        "fixed top-0 left-0 h-full flex flex-col transition-all duration-200 z-30 overflow-hidden",
        collapsed ? "w-14" : "w-[240px]"
      )}
    >
      {/* Indigo gradient glow top-left */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: "radial-gradient(800px 200px at 0% 0%, oklch(0.66 0.19 278 / 0.10), transparent 60%)",
        }}
      />

      {/* Brand header — full when expanded, toggle-only when collapsed */}
      <div
        className="relative z-10 shrink-0 flex items-center"
        style={{
          height: 60,
          borderBottom: "1px solid var(--line-soft)",
          padding: collapsed ? "0" : "0 16px",
          justifyContent: collapsed ? "center" : "flex-start",
          gap: 10,
        }}
      >
        {!collapsed && (
          <>
            <div
              className="shrink-0 flex items-center justify-center rounded-md"
              style={{
                width: 28, height: 28,
                background: "linear-gradient(135deg, var(--indigo) 0%, oklch(0.56 0.18 295) 100%)",
                boxShadow: "0 0 0 1px oklch(0.66 0.19 278 / 0.5), 0 6px 20px -4px oklch(0.66 0.19 278 / 0.4)",
              }}
            >
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none">
                <path d="M3 12 C7 4, 11 20, 15 12 S 21 4, 21 12" stroke="white" strokeWidth="2" strokeLinecap="round" fill="none"/>
              </svg>
            </div>
            <div className="flex-1 min-w-0">
              <div style={{ fontSize: 13, fontWeight: 600, color: "var(--fg)", letterSpacing: "-0.01em" }}>Helm CRM</div>
              <div style={{ fontSize: 10, color: "var(--fg-mute)", fontFamily: "var(--font-mono-ndt)", letterSpacing: "0.05em", textTransform: "uppercase" }}>Controllabor</div>
            </div>
          </>
        )}

        <button
          onClick={toggle}
          className="flex items-center justify-center rounded transition-colors"
          style={{
            width: 28, height: 28, flexShrink: 0,
            color: "var(--fg-faint)",
            marginLeft: collapsed ? 0 : "auto",
          }}
          onMouseOver={(e) => (e.currentTarget.style.color = "var(--fg)")}
          onMouseOut={(e) => (e.currentTarget.style.color = "var(--fg-faint)")}
        >
          {collapsed ? <ChevronRight className="size-3.5" /> : <ChevronLeft className="size-3.5" />}
        </button>
      </div>

      {/* Nav */}
      <nav className="relative z-10 flex-1 overflow-y-auto py-3 px-2.5 space-y-4">
        {NAV.map(({ group, items }) => (
          <div key={group}>
            {!collapsed && (
              <div
                style={{
                  fontSize: 10, fontWeight: 600, color: "var(--fg-faint)",
                  letterSpacing: "0.12em", textTransform: "uppercase",
                  padding: "10px 8px 5px",
                }}
              >
                {group}
              </div>
            )}
            <ul className="space-y-0.5">
              {items.map(({ href, label, icon: Icon }) => {
                const active = href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      title={collapsed ? label : undefined}
                      className="relative flex items-center gap-2.5 rounded transition-colors duration-150"
                      style={{
                        height: 32, padding: "0 8px",
                        fontSize: 13, fontWeight: 500,
                        color: active ? "var(--fg)" : "var(--fg-soft)",
                        background: active
                          ? "linear-gradient(90deg, oklch(0.66 0.19 278 / 0.18), oklch(0.66 0.19 278 / 0.04))"
                          : "transparent",
                      }}
                      onMouseOver={(e) => { if (!active) e.currentTarget.style.background = "oklch(0.30 0.014 255 / 0.30)"; }}
                      onMouseOut={(e) => { if (!active) e.currentTarget.style.background = "transparent"; }}
                    >
                      {/* Active indicator */}
                      {active && (
                        <span
                          className="absolute rounded-full"
                          style={{
                            left: -10, top: 6, bottom: 6, width: 2,
                            background: "var(--indigo)",
                            boxShadow: "0 0 12px oklch(0.66 0.19 278 / 0.7)",
                          }}
                        />
                      )}
                      <span
                        className="shrink-0 flex items-center justify-center"
                        style={{
                          width: 16, height: 16,
                          color: active ? "var(--indigo)" : "currentColor",
                          opacity: active ? 1 : 0.85,
                        }}
                      >
                        <Icon />
                      </span>
                      {!collapsed && <span>{label}</span>}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </div>
        ))}
      </nav>
    </aside>
  );
}
