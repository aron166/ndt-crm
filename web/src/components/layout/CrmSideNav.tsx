"use client";
// Hungarian copy is PROPOSAL until Áron approves.

import { usePathname, useRouter } from "next/navigation";
import { SideNav, SideNavHeading, SideNavItem, SideNavSection } from "@astryxdesign/core/SideNav";
import { Badge } from "@astryxdesign/core/Badge";
import { Button } from "@astryxdesign/core/Button";
import { IconButton } from "@astryxdesign/core/IconButton";
import { Avatar } from "@astryxdesign/core/Avatar";
import { HStack } from "@astryxdesign/core/HStack";
import { Text } from "@astryxdesign/core/Text";
import { Kbd } from "@astryxdesign/core/Kbd";
import {
  Inbox, Headset, ClipboardList, LayoutDashboard, Building2, Users, KanbanSquare, FileText, Receipt, Mail,
  Megaphone, Settings, MoreHorizontal, Zap, BarChart3, CalendarDays, ScrollText, Sparkles, Wallet, Upload,
  Search, Plus, LogOut,
} from "lucide-react";
import { createClient } from "@/lib/supabase/client";

type Counts = { overdueTasks: number; overdueLeads: number; marketingReview: number };

// Grouped by the work of the day (direction A), not by database table. Every
// route the old sidebar had is still here; the admin screens sit under Továbbiak.
const MORE = [
  { href: "/automations", label: "Automatizálás", icon: Zap },
  { href: "/analytics", label: "Analytics", icon: BarChart3 },
  { href: "/reports/weekly", label: "Heti riport", icon: CalendarDays },
  { href: "/patchnotes", label: "Patchnotes", icon: ScrollText },
  { href: "/enrichment", label: "Enrichment", icon: Sparkles },
  { href: "/rate-card", label: "Díjszabás", icon: Wallet },
  { href: "/import", label: "Importálás", icon: Upload },
];

export function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function CrmSideNav({
  email, counts, onSearch, onNewTask, onNewDeal,
}: {
  email: string;
  counts: Counts;
  onSearch: () => void;
  onNewTask: () => void;
  onNewDeal: () => void;
}) {
  const pathname = usePathname();
  const router = useRouter();
  const on = (href: string) => isActive(pathname, href);
  const moreOpen = MORE.some((m) => on(m.href));

  async function signOut() {
    await createClient().auth.signOut();
    router.push("/login");
    router.refresh();
  }

  return (
    <SideNav
      header={<SideNavHeading heading="Helm CRM" subheading="Controllabor" />}
      topContent={
        <div className="crm-nav-top">
          <button type="button" className="crm-search" onClick={onSearch}>
            <Search size={15} aria-hidden />
            <span>Keresés</span>
            <Kbd keys="mod+k" />
          </button>
          <HStack gap={2}>
            <Button label="Feladat" aria-label="Új feladat" size="sm" variant="primary" icon={<Plus size={14} />} onClick={onNewTask} />
            <Button label="Deal" aria-label="Új deal" size="sm" icon={<Plus size={14} />} onClick={onNewDeal} />
          </HStack>
        </div>
      }
      footer={
        <HStack gap={2} vAlign="center" padding={2}>
          <Avatar name={email} size="sm" tooltip={false} />
          <span className="crm-nav-email"><Text size="sm" color="secondary">{email}</Text></span>
          <IconButton label="Kijelentkezés" tooltip="Kijelentkezés" variant="ghost" size="sm" icon={<LogOut size={15} />} onClick={signOut} />
        </HStack>
      }
    >
      <SideNavSection title="Mai munka">
        <SideNavItem
          label="Leadek" href="/leads" icon={Inbox} isSelected={on("/leads")}
          endContent={counts.overdueLeads > 0 ? <Badge variant="error" label={`${counts.overdueLeads} késik`} /> : undefined}
        />
        <SideNavItem label="Hívás mód" href="/calls" icon={Headset} isSelected={on("/calls")} />
        <SideNavItem
          label="Feladatok" href="/tasks" icon={ClipboardList} isSelected={on("/tasks")}
          endContent={counts.overdueTasks > 0 ? <Badge variant="warning" label={`${counts.overdueTasks} lejárt`} /> : undefined}
        />
        <SideNavItem label="Áttekintés" href="/" icon={LayoutDashboard} isSelected={on("/")} />
      </SideNavSection>
      <SideNavSection title="Ügyfelek">
        <SideNavItem label="Cégek" href="/companies" icon={Building2} isSelected={on("/companies")} />
        <SideNavItem label="Személyek" href="/persons" icon={Users} isSelected={on("/persons")} />
        <SideNavItem label="Pipeline" href="/deals" icon={KanbanSquare} isSelected={on("/deals")} />
        <SideNavItem label="Árajánlatok" href="/quotes" icon={FileText} isSelected={on("/quotes")} />
        <SideNavItem label="Számlák" href="/invoices" icon={Receipt} isSelected={on("/invoices")} />
        <SideNavItem label="Outreach" href="/outreach" icon={Mail} isSelected={on("/outreach")} />
      </SideNavSection>
      <SideNavSection title="Rendszer">
        <SideNavItem
          label="Marketing" href="/marketing" icon={Megaphone} isSelected={on("/marketing") || on("/campaigns")}
          endContent={counts.marketingReview > 0 ? <Badge variant="info" label={String(counts.marketingReview)} /> : undefined}
        />
        <SideNavItem
          label="Továbbiak" icon={MoreHorizontal} collapsible={{ defaultIsCollapsed: !moreOpen }}
          endContent={<Text type="supporting">{MORE.length}</Text>}
        >
          {MORE.map((m) => (
            <SideNavItem key={m.href} label={m.label} href={m.href} icon={m.icon} isSelected={on(m.href)} />
          ))}
        </SideNavItem>
        <SideNavItem label="Beállítások" href="/settings" icon={Settings} isSelected={on("/settings")} />
      </SideNavSection>
    </SideNav>
  );
}
