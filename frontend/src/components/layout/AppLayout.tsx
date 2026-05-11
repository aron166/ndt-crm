import { useState, type ReactNode } from 'react'
import { cn } from '@/lib/utils'
import { Sidebar } from './Sidebar'
import { Topbar } from './Topbar'

const COLLAPSED_KEY = 'sidebar-collapsed'

function getInitialCollapsed(): boolean {
  try {
    return localStorage.getItem(COLLAPSED_KEY) === 'true'
  } catch {
    return false
  }
}

interface AppLayoutProps {
  children: ReactNode
}

export function AppLayout({ children }: AppLayoutProps) {
  const [collapsed, setCollapsed] = useState(getInitialCollapsed)

  function handleToggle() {
    setCollapsed((prev) => {
      const next = !prev
      try {
        localStorage.setItem(COLLAPSED_KEY, String(next))
      } catch {
        // ignore
      }
      return next
    })
  }

  return (
    <div className="min-h-screen bg-slate-50">
      <Sidebar collapsed={collapsed} onToggle={handleToggle} />
      <Topbar sidebarCollapsed={collapsed} />
      <main
        className={cn(
          'pt-14 min-h-screen transition-all duration-200',
          collapsed ? 'pl-14' : 'pl-60',
        )}
      >
        <div className="px-6 py-6 max-w-[1280px]">
          {children}
        </div>
      </main>
    </div>
  )
}
