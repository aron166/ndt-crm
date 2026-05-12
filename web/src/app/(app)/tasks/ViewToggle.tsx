"use client";

import Link from "next/link";
import { List, LayoutGrid } from "lucide-react";
import { cn } from "@/lib/utils";

interface ViewToggleProps {
  view: string;
  statusFilter: string;
  dueFilter: string;
}

export function ViewToggle({ view, statusFilter, dueFilter }: ViewToggleProps) {
  return (
    <div className="flex items-center bg-white border border-slate-200 rounded-lg p-0.5">
      <Link
        href={`/tasks?status=${statusFilter}&due=${dueFilter}&view=list`}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-md text-sm transition-colors",
          view === "list"
            ? "bg-slate-900 text-white"
            : "text-slate-500 hover:text-slate-700"
        )}
        title="Lista nézet"
      >
        <List className="size-3.5" />
        <span className="hidden sm:inline">Lista</span>
      </Link>
      <Link
        href={`/tasks?view=kanban`}
        className={cn(
          "flex items-center gap-1.5 px-3 py-1 rounded-md text-sm transition-colors",
          view === "kanban"
            ? "bg-slate-900 text-white"
            : "text-slate-500 hover:text-slate-700"
        )}
        title="Kanban nézet"
      >
        <LayoutGrid className="size-3.5" />
        <span className="hidden sm:inline">Kanban</span>
      </Link>
    </div>
  );
}
