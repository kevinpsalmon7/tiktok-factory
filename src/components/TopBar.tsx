'use client'

import { Search, Bell } from 'lucide-react'
import Image from 'next/image'

type TopBarProps = {
  avatarUrl?: string | null
  userName?: string | null
}

export function TopBar({ avatarUrl, userName }: TopBarProps) {
  return (
    <header className="flex items-center gap-4 px-6 py-4">
      <div className="relative flex-1 max-w-md">
        <Search size={16} className="absolute left-3.5 top-1/2 -translate-y-1/2 text-ink-600/50" />
        <input
          type="text"
          placeholder="Rechercher..."
          className="w-full pl-10 pr-4 py-2.5 bg-white rounded-full text-sm placeholder:text-ink-600/40 focus:outline-none focus:ring-2 focus:ring-ink-900/10 shadow-soft"
        />
      </div>

      <div className="flex-1" />

      <button className="p-2.5 rounded-full bg-white shadow-soft hover:shadow-card transition">
        <Bell size={16} className="text-ink-700" />
      </button>

      <div className="flex items-center gap-3 px-3 py-1.5 bg-white rounded-full shadow-soft">
        {avatarUrl ? (
          <Image
            src={avatarUrl}
            alt={userName || 'User'}
            width={28}
            height={28}
            className="rounded-full"
          />
        ) : (
          <div className="w-7 h-7 rounded-full bg-pastel-lavender flex items-center justify-center text-xs font-medium text-ink-900">
            {userName?.[0]?.toUpperCase() || '?'}
          </div>
        )}
        <span className="text-sm font-medium text-ink-900 pr-2 hidden sm:block">
          {userName || 'Utilisateur'}
        </span>
      </div>
    </header>
  )
}
