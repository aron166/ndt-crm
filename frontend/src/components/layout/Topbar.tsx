import * as DropdownMenu from '@radix-ui/react-dropdown-menu'
import { LogOut, User } from 'lucide-react'
import { useAuth } from '@/contexts/AuthContext'
import { cn } from '@/lib/utils'

interface TopbarProps {
  sidebarCollapsed: boolean
}

export function Topbar({ sidebarCollapsed }: TopbarProps) {
  const { user, logout } = useAuth()

  const initials = user?.email
    ? user.email.slice(0, 2).toUpperCase()
    : 'U'

  return (
    <header
      className={cn(
        'fixed top-0 right-0 z-30 h-14 bg-white border-b border-slate-200 flex items-center justify-end px-6 transition-all duration-200',
        sidebarCollapsed ? 'left-14' : 'left-60',
      )}
    >
      <DropdownMenu.Root>
        <DropdownMenu.Trigger asChild>
          <button className="flex items-center gap-2.5 rounded px-2 py-1.5 hover:bg-slate-50 transition-colors focus:outline-none">
            <div className="w-7 h-7 rounded-full bg-indigo-700 flex items-center justify-center text-white text-xs font-semibold shrink-0">
              {initials}
            </div>
            <span className="text-sm font-medium text-slate-700 hidden sm:block">
              {user?.email ?? ''}
            </span>
          </button>
        </DropdownMenu.Trigger>

        <DropdownMenu.Portal>
          <DropdownMenu.Content
            align="end"
            sideOffset={6}
            className="min-w-48 bg-white border border-slate-200 rounded-md shadow-dropdown py-1 z-50"
          >
            <div className="px-3 py-2 border-b border-slate-100">
              <p className="text-xs text-slate-500">Bejelentkezve</p>
              <p className="text-sm font-medium text-slate-800 truncate">{user?.email}</p>
            </div>

            <DropdownMenu.Item
              onSelect={() => void 0}
              className="flex items-center gap-2 px-3 py-2 text-sm text-slate-700 hover:bg-slate-50 cursor-pointer focus:outline-none focus:bg-slate-50"
            >
              <User size={14} className="text-slate-400" />
              Profilom
            </DropdownMenu.Item>

            <DropdownMenu.Separator className="my-1 border-t border-slate-100" />

            <DropdownMenu.Item
              onSelect={logout}
              className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 cursor-pointer focus:outline-none focus:bg-red-50"
            >
              <LogOut size={14} />
              Kijelentkezés
            </DropdownMenu.Item>
          </DropdownMenu.Content>
        </DropdownMenu.Portal>
      </DropdownMenu.Root>
    </header>
  )
}
