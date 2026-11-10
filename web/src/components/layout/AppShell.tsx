"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import dynamic from "next/dynamic";
import { AppShell as AxAppShell } from "@astryxdesign/core/AppShell";
import { AstryxProviders } from "./AstryxProviders";
import { CrmSideNav } from "./CrmSideNav";
import { CommandPalette } from "@/components/CommandPalette";

// The modals pull in EntitySearch, Select, the costing lib and two server
// actions (~520 lines + deps). They load after hydration, never on the
// critical path (docs/PERF_2026-09-08_INP.md, Vanda PR #86).
const TaskModal = dynamic(
  () => import("@/app/(app)/tasks/TaskModal").then((m) => m.TaskModal),
  { ssr: false },
);
const DealModal = dynamic(
  () => import("@/app/(app)/deals/DealModal").then((m) => m.DealModal),
  { ssr: false },
);

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
  overdueLeadCount?: number;
  marketingReviewCount?: number;
  defaultPipeline?: PipelineStub | null;
}

export function AppShell({
  children, email, overdueCount = 0, overdueLeadCount = 0, marketingReviewCount = 0, defaultPipeline,
}: AppShellProps) {
  const router = useRouter();
  const [searchOpen, setSearchOpen] = useState(false);
  const [taskOpen, setTaskOpen] = useState(false);
  const [dealOpen, setDealOpen] = useState(false);
  // Mount both closed modals after hydration so the first open paints in one
  // frame instead of waiting on the chunk (a closed base-ui Dialog renders nothing).
  const [modalsMounted, setModalsMounted] = useState(false);
  useEffect(() => setModalsMounted(true), []);

  // Cmd+K / Ctrl+K global shortcut
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
    <AstryxProviders>
      <AxAppShell
        height="fill"
        variant="section"
        sideNav={
          <CrmSideNav
            email={email}
            counts={{ overdueTasks: overdueCount, overdueLeads: overdueLeadCount, marketingReview: marketingReviewCount }}
            onSearch={() => setSearchOpen(true)}
            onNewTask={() => setTaskOpen(true)}
            onNewDeal={() => (defaultPipeline ? setDealOpen(true) : router.push("/deals/setup"))}
          />
        }
      >
        <div className="crm-page max-w-[1400px] mx-auto px-4 py-4 md:px-8 md:py-6">{children}</div>
      </AxAppShell>

      {modalsMounted && (
        <TaskModal open={taskOpen} onClose={() => { setTaskOpen(false); router.refresh(); }} />
      )}
      {modalsMounted && defaultPipeline && (
        <DealModal open={dealOpen} onClose={() => { setDealOpen(false); router.refresh(); }} pipeline={defaultPipeline} />
      )}
      <CommandPalette open={searchOpen} onClose={() => setSearchOpen(false)} />
    </AstryxProviders>
  );
}
