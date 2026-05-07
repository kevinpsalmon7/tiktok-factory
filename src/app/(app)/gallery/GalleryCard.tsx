'use client'

import Link from 'next/link'
import { Images, FolderDown, Loader2 } from 'lucide-react'
import { useState } from 'react'
import JSZip from 'jszip'
import { DeleteCarouselButton } from '@/components/DeleteCarouselButton'

type Slide = { rendered_url?: string }

function folderName(title: string, carouselType: string, createdAt: string): string {
  const date = new Date(createdAt)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(-2)
  const dateStr = `${dd}${mm}${yy}`
  const stopWords = new Set(['a','an','the','and','or','of','in','on','at','to','for','with','le','la','les','de','du','des','en','et','ou','un','une'])
  const source = (title || carouselType || '').toLowerCase()
  const words = source.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w))
  return `${dateStr}-${words[0] || 'carousel'}`
}

export function GalleryCard({
  id,
  title,
  carouselType,
  prompt,
  status,
  slides,
  createdAt,
  formattedDate,
  selectionMode = false,
  selected = false,
  onToggleSelect,
}: {
  id: string
  title: string
  carouselType: string
  prompt: string
  status: string
  slides: Slide[]
  createdAt: string
  formattedDate: string
  selectionMode?: boolean
  selected?: boolean
  onToggleSelect?: (id: string) => void
}) {
  const [downloading, setDownloading] = useState(false)

  const hasImage = Boolean(slides?.[0]?.rendered_url)
  const renderedSlides = slides.filter(s => s.rendered_url)

  async function handleDownload(e: React.MouseEvent) {
    e.preventDefault()
    e.stopPropagation()
    if (renderedSlides.length === 0) return
    setDownloading(true)
    try {
      const zip = new JSZip()
      const name = folderName(title, carouselType, createdAt)
      await Promise.all(
        renderedSlides.map(async (slide, i) => {
          const res = await fetch(slide.rendered_url!)
          const blob = await res.blob()
          zip.file(`${String(i + 1).padStart(2, '0')}.jpg`, blob)
        })
      )
      const content = await zip.generateAsync({ type: 'blob' })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setDownloading(false)
    }
  }

  const statusBadge = (s: string) => {
    switch (s) {
      case 'completed': return 'bg-pastel-mint text-ink-900'
      case 'generating': return 'bg-pastel-lemon text-ink-900'
      case 'failed': return 'bg-pastel-pinkDeep text-white'
      default: return 'bg-white text-ink-700'
    }
  }

  if (selectionMode) {
    return (
      <div
        className="group block cursor-pointer"
        onClick={() => onToggleSelect?.(id)}
      >
        <div className={`aspect-[9/16] rounded-xl2 overflow-hidden bg-cream-100 relative shadow-soft transition ${selected ? 'ring-4 ring-ink-900' : 'hover:shadow-card'}`}>
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slides[0].rendered_url} alt={prompt} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-600/40">
              <Images size={32} />
            </div>
          )}
          {selected && (
            <div className="absolute inset-0 bg-ink-900/30 flex items-center justify-center">
              <div className="w-8 h-8 rounded-full bg-ink-900 flex items-center justify-center text-white text-lg font-bold">✓</div>
            </div>
          )}
        </div>
        <p className="text-sm text-ink-900 font-medium line-clamp-1 mt-2">
          {title || carouselType || prompt || 'Sans titre'}
        </p>
        <p className="text-xs text-ink-600/60">{formattedDate}</p>
      </div>
    )
  }

  return (
    <div className="group block">
      <div className="aspect-[9/16] rounded-xl2 overflow-hidden bg-cream-100 relative shadow-soft group-hover:shadow-card transition">
        <Link href={`/gallery/${id}`} className="absolute inset-0">
          {hasImage ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={slides[0].rendered_url} alt={prompt} className="w-full h-full object-cover" />
          ) : (
            <div className="w-full h-full flex items-center justify-center text-ink-600/40">
              <Images size={32} />
            </div>
          )}
        </Link>
        <div className="absolute top-2 left-2">
          <span className={`chip text-[10px] ${statusBadge(status)}`}>{status}</span>
        </div>
        <div className="absolute top-2 right-2 flex flex-col gap-1">
          {renderedSlides.length > 0 && (
            <button
              onClick={handleDownload}
              disabled={downloading}
              className="p-2 bg-white/90 rounded-full hover:bg-white shadow-sm disabled:opacity-60 transition"
              title="Télécharger"
            >
              {downloading
                ? <Loader2 size={13} className="animate-spin" />
                : <FolderDown size={13} />
              }
            </button>
          )}
          <DeleteCarouselButton id={id} redirectAfter={null} />
        </div>
      </div>
      <Link href={`/gallery/${id}`} className="block mt-2">
        <p className="text-sm text-ink-900 font-medium line-clamp-1">
          {title || carouselType || prompt || 'Sans titre'}
        </p>
        <p className="text-xs text-ink-600/60">{formattedDate}</p>
      </Link>
    </div>
  )
}
