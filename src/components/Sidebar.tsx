'use client'

import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import {
  LayoutDashboard,
  Images,
  LayoutTemplate,
  Settings,
  LogOut,
  History,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { cn } from '@/lib/utils'

type NavItem = { href: string; label: string; icon: React.ElementType }

const generalItems: NavItem[] = [
  { href: '/dashboard', label: 'Dashboard', icon: LayoutDashboard },
  { href: '/templates', label: 'Templates', icon: LayoutTemplate },
  { href: '/gallery', label: 'Galerie', icon: Images },
  { href: '/historique', label: 'Historique', icon: History },
]

const toolsItems: NavItem[] = [
  { href: '/settings', label: 'Paramètres', icon: Settings },
]

export function Sidebar() {
  const pathname = usePathname()
  const router = useRouter()

  async function handleLogout() {
    const supabase = createClient()
    await supabase.auth.signOut()
    router.push('/login')
    router.refresh()
  }

  return (
    <aside className="w-[88px] bg-ink-900 text-white/80 flex flex-col items-stretch py-5 rounded-[28px] m-4 mr-0">
      {/* Logo */}
      <div className="px-5 pb-6 flex items-center justify-center">
        <div className="font-display font-bold text-2xl text-white leading-none tracking-tight">tf.</div>
      </div>

      <NavSection label="Général" items={generalItems} pathname={pathname} />

      <div className="flex-1" />

      <NavSection label="Outils" items={toolsItems} pathname={pathname} />

      <button
        onClick={handleLogout}
        className="mx-3 mt-4 flex items-center justify-center gap-2 px-2 py-3 rounded-xl hover:bg-ink-700 transition"
        title="Déconnexion"
      >
        <LogOut size={18} />
      </button>
    </aside>
  )
}

function NavSection({
  label,
  items,
  pathname,
}: {
  label: string
  items: NavItem[]
  pathname: string
}) {
  return (
    <div className="mb-2">
      <div className="px-4 pb-1.5 text-[9px] uppercase tracking-[0.15em] text-white/30 text-center">
        {label}
      </div>
      <nav className="flex flex-col gap-0.5 px-3">
        {items.map((item) => {
          const active = pathname === item.href || pathname.startsWith(item.href + '/')
          const Icon = item.icon
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                'flex flex-col items-center gap-1 px-2 py-2.5 rounded-xl text-[10px] transition',
                active
                  ? 'bg-white/10 text-white'
                  : 'text-white/60 hover:bg-ink-700 hover:text-white'
              )}
              title={item.label}
            >
              <Icon size={18} />
              <span>{item.label}</span>
            </Link>
          )
        })}
      </nav>
    </div>
  )
}
