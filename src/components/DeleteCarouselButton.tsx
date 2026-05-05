'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Trash2, Loader2 } from 'lucide-react'

export function DeleteCarouselButton({
  id,
  redirectAfter = '/gallery',
  variant = 'icon',
}: {
  id: string
  redirectAfter?: string | null
  variant?: 'icon' | 'button'
}) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [confirming, setConfirming] = useState(false)

  async function handleDelete() {
    setLoading(true)
    try {
      await fetch(`/api/carousels/${id}`, { method: 'DELETE' })
      if (redirectAfter) {
        router.push(redirectAfter)
        router.refresh()
      } else {
        router.refresh()
      }
    } finally {
      setLoading(false)
      setConfirming(false)
    }
  }

  if (confirming) {
    return (
      <div className="flex items-center gap-1.5">
        <span className="text-xs text-ink-600">Supprimer ?</span>
        <button
          onClick={handleDelete}
          disabled={loading}
          className="px-2.5 py-1 rounded-full bg-red-500 text-white text-xs font-medium hover:bg-red-600 disabled:opacity-50 flex items-center gap-1"
        >
          {loading ? <Loader2 size={11} className="animate-spin" /> : null}
          Oui
        </button>
        <button
          onClick={() => setConfirming(false)}
          className="px-2.5 py-1 rounded-full bg-cream-100 text-ink-700 text-xs hover:bg-cream-200"
        >
          Non
        </button>
      </div>
    )
  }

  if (variant === 'button') {
    return (
      <button
        onClick={() => setConfirming(true)}
        className="inline-flex items-center gap-2 px-4 py-2 rounded-full text-sm text-red-500 hover:bg-red-50 border border-red-200 transition"
      >
        <Trash2 size={14} />
        Supprimer
      </button>
    )
  }

  return (
    <button
      onClick={(e) => { e.preventDefault(); e.stopPropagation(); setConfirming(true) }}
      className="p-2 bg-white/90 rounded-full hover:bg-white shadow-sm transition"
      title="Supprimer"
    >
      <Trash2 size={13} className="text-red-400" />
    </button>
  )
}
