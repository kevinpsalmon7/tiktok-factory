'use client'

import { Bell } from 'lucide-react'
import Image from 'next/image'

type TopBarProps = {
  avatarUrl?: string | null
  userName?: string | null
}

export function TopBar({ avatarUrl, userName }: TopBarProps) {
  return (
    <header className="flex items-center gap-4 px-6 py-4">
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
          {userName || 'User'}
        </span>
      </div>
    </header>
  )
}
