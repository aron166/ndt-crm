"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Building2,
  Users,
  CheckSquare,
  TrendingUp,
  Target,
  FileText,
  Wrench,
  LayoutDashboard,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV = [
  {
    section: "CRM",
    items: [
      { href: "/", label: "Dashboard", icon: LayoutDashboard },
      { href: "/companies", label: "Cégek", icon: Building2 },
      { href: "/persons", label: "Személyek", icon: Users },
      { href: "/tasks", label: "Feladatok", icon: CheckSquare },
      { href: "/deals", label: "Deals", icon: TrendingUp },
      { href: "/leads", label: "Leads", icon: Target },
    ],
  },
  {
    section: "Üzemeltetés",
    items: [
      { href: "/invoices", label: "Számlák", icon: FileText },
      { href: "/equipment", label: "Eszközök", icon: Wrench },
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
      className={cn(
        "fixed top-0 left-0 h-full bg-slate-900 text-slate-300 flex flex-col transition-all duration-200 z-30",
        collapsed ? "w-14" : "w-60"
      )}
    >
      <div className="flex items-center h-14 px-3 border-b border-slate-800">
        {!collapsed && (
          <span className="font-semibold text-white text-sm flex-1 pl-1">
            NDT CRM
          </span>
        )}
        <button
          onClick={toggle}
          className="ml-auto p-1 rounded hover:bg-slate-800 text-slate-400 hover:text-white transition-colors"
        >
          {collapsed ? (
            <ChevronRight className="size-4" />
          ) : (
            <ChevronLeft className="size-4" />
          )}
        </button>
      </div>

      <nav className="flex-1 overflow-y-auto py-3 space-y-4">
        {NAV.map(({ section, items }) => (
          <div key={section}>
            {!collapsed && (
              <p className="px-4 mb-1 text-[10px] font-semibold uppercase tracking-wider text-slate-500">
                {section}
              </p>
            )}
            <ul className="space-y-0.5 px-2">
              {items.map(({ href, label, icon: Icon }) => {
                const active =
                  href === "/" ? pathname === "/" : pathname.startsWith(href);
                return (
                  <li key={href}>
                    <Link
                      href={href}
                      className={cn(
                        "flex items-center gap-3 px-2 py-1.5 rounded-md text-sm transition-colors",
                        active
                          ? "bg-indigo-600 text-white"
                          : "hover:bg-slate-800 hover:text-white"
                      )}
                      title={collapsed ? label : undefined}
                    >
                      <Icon className="size-4 shrink-0" />
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
