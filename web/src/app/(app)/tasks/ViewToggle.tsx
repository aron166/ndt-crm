"use client";

import { Seg } from "@/components/astryx/PageHeader";

interface ViewToggleProps {
  view: string;
  statusFilter: string;
  dueFilter: string;
}

export function ViewToggle({ view, statusFilter, dueFilter }: ViewToggleProps) {
  return (
    <Seg
      label="Nézet"
      current={view}
      items={[
        { key: "list", label: "Lista", href: `/tasks?status=${statusFilter}&due=${dueFilter}&view=list` },
        { key: "kanban", label: "Kanban", href: `/tasks?view=kanban` },
      ]}
    />
  );
}
