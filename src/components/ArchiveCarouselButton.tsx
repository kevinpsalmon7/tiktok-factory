'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function ArchiveCarouselButton({
  id,
  archived,
  variant = 'icon',
}: {
  id: string
  archived: boolean
  variant?: 'icon' | 'button'
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)

  async function handleToggle(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    setLoading(true)
    try {
      const supabase = createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('carousels') as any)
        .update({ archived: !archived })
        .eq('id', id)
      router.refresh()
    } finally {
      setLoading(false)
    }
  }

  if (variant === 'button') {
    return (
      <button
        onClick={handleToggle}
        disabled={loading}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm text-ink-700 hover:bg-ink-100 border border-ink-200 transition disabled:opacity-50"
        title={archived ? 'Restaurer dans la galerie' : 'Archiver'}
      >
        {loading ? (
          <Loader2 size={14} className="animate-spin" />
        ) : archived ? (
          <ArchiveRestore size={14} />
        ) : (
          <Archive size={14} />
        )}
        {archived ? 'Restaurer' : 'Archiver'}
      </button>
    )
  }

  return (
    <button
      onClick={handleToggle}
      disabled={loading}
      className="p-2 bg-white/90 rounded-full hover:bg-white shadow-sm disabled:opacity-60 transition"
      title={archived ? 'Restaurer' : 'Archiver'}
    >
      {loading ? (
        <Loader2 size={13} className="animate-spin" />
      ) : archived ? (
        <ArchiveRestore size={13} className="text-ink-600" />
      ) : (
        <Archive size={13} className="text-ink-600" />
      )}
    </button>
  )
}
