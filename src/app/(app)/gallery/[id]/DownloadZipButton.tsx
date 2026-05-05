'use client'

import { useState } from 'react'
import { FolderDown, Loader2 } from 'lucide-react'
import JSZip from 'jszip'

type Slide = {
  index: number
  rendered_url?: string
}

function folderName(title: string, carouselType: string, createdAt: string): string {
  const date = new Date(createdAt)
  const dd = String(date.getDate()).padStart(2, '0')
  const mm = String(date.getMonth() + 1).padStart(2, '0')
  const yy = String(date.getFullYear()).slice(-2)
  const dateStr = `${dd}${mm}${yy}`

  const source = (title || carouselType || '').toLowerCase()
  const stopWords = new Set(['a', 'an', 'the', 'and', 'or', 'but', 'of', 'in', 'on', 'at', 'to', 'for', 'with', 'le', 'la', 'les', 'de', 'du', 'des', 'en', 'et', 'ou', 'un', 'une', 'ce', 'se', 'ne', 'pas'])
  const words = source.replace(/[^a-zA-ZÀ-ÿ0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2 && !stopWords.has(w))
  const word = words[0] || 'carousel'

  return `${dateStr}-${word}`
}

export function DownloadZipButton({
  slides,
  title,
  carouselType,
  createdAt,
}: {
  slides: Slide[]
  title: string
  carouselType: string
  createdAt: string
}) {
  const [loading, setLoading] = useState(false)

  const renderedSlides = slides.filter(s => s.rendered_url)
  if (renderedSlides.length === 0) return null

  async function handleDownload() {
    setLoading(true)
    try {
      const zip = new JSZip()
      const name = folderName(title, carouselType, createdAt)

      await Promise.all(
        renderedSlides.map(async (slide) => {
          const res = await fetch(slide.rendered_url!)
          const blob = await res.blob()
          const filename = `${String(slide.index).padStart(2, '0')}.jpg`
          zip.file(filename, blob)
        })
      )

      const content = await zip.generateAsync({ type: 'blob', compression: 'DEFLATE', compressionOptions: { level: 6 } })
      const url = URL.createObjectURL(content)
      const a = document.createElement('a')
      a.href = url
      a.download = `${name}.zip`
      a.click()
      URL.revokeObjectURL(url)
    } finally {
      setLoading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={loading}
      className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 disabled:opacity-50 shadow-card transition"
    >
      {loading ? <Loader2 size={14} className="animate-spin" /> : <FolderDown size={14} />}
      {loading ? 'Compression…' : 'Télécharger le carousel'}
    </button>
  )
}
