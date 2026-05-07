'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Archive, ArchiveRestore, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

export function ArchiveCarouselButton({
  id,
  archived,
}: {
  id: string
  archived: boolean
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
