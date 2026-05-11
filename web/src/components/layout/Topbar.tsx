"use client";

import { useRouter } from "next/navigation";
import { createClient } from "@/lib/supabase/client";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { LogOut, User } from "lucide-react";

interface TopbarProps {
  collapsed: boolean;
  email: string;
}

export function Topbar({ collapsed, email }: TopbarProps) {
  const router = useRouter();

  async function handleSignOut() {
    const supabase = createClient();
    await supabase.auth.signOut();
    router.push("/login");
    router.refresh();
  }

  const initials = email
    .split("@")[0]
    .slice(0, 2)
    .toUpperCase();

  return (
    <header
      className="fixed top-0 right-0 h-14 bg-white border-b border-slate-200 flex items-center justify-end px-4 z-20 transition-all duration-200"
      style={{ left: collapsed ? "3.5rem" : "15rem" }}
    >
      <DropdownMenu>
        <DropdownMenuTrigger className="flex items-center gap-2 px-2 py-1 rounded-lg hover:bg-slate-100 transition-colors">
          <span className="w-7 h-7 rounded-full bg-indigo-600 flex items-center justify-center text-white text-xs font-semibold">
            {initials}
          </span>
          <span className="text-sm text-slate-600 hidden sm:block">
            {email}
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-48">
          <DropdownMenuItem className="gap-2 text-slate-600">
            <User className="size-4" />
            Profil
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="gap-2 text-red-600 focus:text-red-600"
            onClick={handleSignOut}
          >
            <LogOut className="size-4" />
            Kijelentkezés
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </header>
  );
}
