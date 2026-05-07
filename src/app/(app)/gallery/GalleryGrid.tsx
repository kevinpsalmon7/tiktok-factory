'use client'

import { useState } from 'react'
import { Trash2, Archive, ArchiveRestore, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { GalleryCard } from './GalleryCard'

type CarouselRow = {
  id: string
  title: string
  prompt: string
  carousel_type: string
  status: string
  slides: { rendered_url?: string }[]
  created_at: string
  formattedDate: string
  archived: boolean
}

export function GalleryGrid({
  carousels,
  mode = 'gallery',
}: {
  carousels: CarouselRow[]
  mode?: 'gallery' | 'archives'
}) {
  const router = useRouter()
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [archiving, setArchiving] = useState(false)

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function cancelSelection() {
    setSelecting(false)
    setSelected(new Set())
  }

  async function handleBulkDelete() {
    if (selected.size === 0) return
    setDeleting(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('carousels') as any)
      .delete()
      .in('id', [...selected])
    setDeleting(false)
    cancelSelection()
    router.refresh()
  }

  async function handleBulkArchive() {
    if (selected.size === 0) return
    setArchiving(true)
    const supabase = createClient()
    const newArchived = mode !== 'archives'
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('carousels') as any)
      .update({ archived: newArchived })
      .in('id', [...selected])
    setArchiving(false)
    cancelSelection()
    router.refresh()
  }

  return (
    <div>
      {/* Toolbar */}
      <div className="flex items-center justify-between mb-4">
        {selecting ? (
          <>
            <span className="text-sm text-ink-600">
              {selected.size} sélectionné{selected.size > 1 ? 's' : ''}
            </span>
            <div className="flex gap-2">
              {selected.size > 0 && (
                <>
                  <button
                    onClick={handleBulkArchive}
                    disabled={archiving}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 disabled:opacity-50 shadow-card"
                  >
                    {mode === 'archives'
                      ? <ArchiveRestore size={13} />
                      : <Archive size={13} />
                    }
                    {archiving
                      ? '…'
                      : mode === 'archives'
                        ? `Restaurer (${selected.size})`
                        : `Archiver (${selected.size})`
                    }
                  </button>
                  <button
                    onClick={handleBulkDelete}
                    disabled={deleting}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full text-sm font-medium hover:bg-red-600 disabled:opacity-50 shadow-card"
                  >
                    <Trash2 size={13} />
                    {deleting ? 'Suppression…' : `Supprimer (${selected.size})`}
                  </button>
                </>
              )}
              <button
                onClick={cancelSelection}
                className="inline-flex items-center gap-2 px-4 py-2 bg-cream-100 text-ink-700 rounded-full text-sm font-medium hover:bg-cream-200"
              >
                <X size={13} />
                Annuler
              </button>
            </div>
          </>
        ) : (
          <button
            onClick={() => setSelecting(true)}
            className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 shadow-card"
          >
            Sélectionner
          </button>
        )}
      </div>

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {carousels.map((c) => (
          <GalleryCard
            key={c.id}
            id={c.id}
            title={c.title}
            carouselType={c.carousel_type}
            prompt={c.prompt}
            status={c.status}
            slides={c.slides}
            createdAt={c.created_at}
            formattedDate={c.formattedDate}
            archived={c.archived}
            selectionMode={selecting}
            selected={selected.has(c.id)}
            onToggleSelect={toggleSelect}
          />
        ))}
      </div>
    </div>
  )
}
