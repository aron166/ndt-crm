import { NavLink } from 'react-router-dom'
import {
  LayoutDashboard,
  Building2,
  Users,
  CheckSquare,
  TrendingUp,
  Inbox,
  Receipt,
  Wrench,
  Sparkles,
  Sun,
  ChevronLeft,
  ChevronRight,
} from 'lucide-react'
import { cn } from '@/lib/utils'

interface NavItem {
  label: string
  to: string
  icon: React.ElementType
}

interface NavGroup {
  title: string
  items: NavItem[]
}

const NAV: NavGroup[] = [
  {
    title: 'CRM',
    items: [
      { label: 'Dashboard', to: '/dashboard', icon: LayoutDashboard },
      { label: 'Cégek', to: '/companies', icon: Building2 },
      { label: 'Személyek', to: '/persons', icon: Users },
      { label: 'Feladatok', to: '/tasks', icon: CheckSquare },
      { label: 'Deals', to: '/deals', icon: TrendingUp },
      { label: 'Leadek', to: '/leads', icon: Inbox },
    ],
  },
  {
    title: 'Üzemeltetés',
    items: [
      { label: 'Számlák', to: '/invoices', icon: Receipt },
      { label: 'Eszközök', to: '/equipment', icon: Wrench },
    ],
  },
  {
    title: 'AI',
    items: [
      { label: 'Lekérdezés', to: '/ai/query', icon: Sparkles },
      { label: 'Napi összefoglaló', to: '/ai/briefing', icon: Sun },
    ],
  },
]

interface SidebarProps {
  collapsed: boolean
  onToggle: () => void
}

export function Sidebar({ collapsed, onToggle }: SidebarProps) {
  return (
    <aside
      className={cn(
        'fixed inset-y-0 left-0 z-40 flex flex-col bg-[#0F172A] border-r border-[#1E293B] transition-all duration-200',
        collapsed ? 'w-14' : 'w-60',
      )}
    >
      {/* Brand */}
      <div className="h-14 flex items-center border-b border-[#1E293B] px-4 shrink-0">
        <span
          className={cn(
            'font-bold text-slate-100 tracking-tight overflow-hidden whitespace-nowrap transition-all duration-200',
            collapsed ? 'w-0 opacity-0' : 'w-full opacity-100',
          )}
        >
          NDT CRM
        </span>
        {collapsed && (
          <span className="font-bold text-indigo-400 text-lg">N</span>
        )}
      </div>

      {/* Nav */}
      <nav className="flex-1 overflow-y-auto overflow-x-hidden py-3 space-y-4">
        {NAV.map((group) => (
          <div key={group.title}>
            {!collapsed && (
              <p className="text-xs font-semibold text-slate-500 uppercase tracking-widest px-3 mb-1">
                {group.title}
              </p>
            )}
            <ul className="space-y-0.5 px-2">
              {group.items.map((item) => (
                <li key={item.to}>
                  <NavLink
                    to={item.to}
                    title={collapsed ? item.label : undefined}
                    className={({ isActive }) =>
                      cn(
                        'h-9 flex items-center gap-2.5 rounded text-sm transition-colors',
                        collapsed ? 'justify-center px-0' : 'px-3',
                        isActive
                          ? 'bg-[#1E3A5F] text-slate-100 border-l-2 border-indigo-500'
                          : 'text-[#94A3B8] hover:bg-[#1E293B] hover:text-slate-200',
                        isActive && collapsed && 'border-l-0',
                      )
                    }
                  >
                    <item.icon size={16} className="shrink-0" />
                    {!collapsed && <span>{item.label}</span>}
                  </NavLink>
                </li>
              ))}
            </ul>
          </div>
        ))}
      </nav>

      {/* Collapse toggle */}
      <div className="shrink-0 border-t border-[#1E293B] p-2">
        <button
          onClick={onToggle}
          className="w-full h-9 flex items-center justify-center rounded text-slate-500 hover:bg-[#1E293B] hover:text-slate-300 transition-colors"
          title={collapsed ? 'Kibontás' : 'Összezárás'}
        >
          {collapsed ? <ChevronRight size={16} /> : <ChevronLeft size={16} />}
        </button>
      </div>
    </aside>
  )
}
