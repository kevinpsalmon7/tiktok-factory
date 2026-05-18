'use client'

import { useState } from 'react'
import { ChevronDown } from 'lucide-react'

type Slide = {
  index: number
  slide_type: string
  text_fields: Record<string, string>
}

type CarouselItem = {
  id: string
  title: string
  carousel_type: string
  prompt: string
  created_at: string
  slides: Slide[]
}

function formatDate(iso: string): string {
  const d = new Date(iso)
  return d.toLocaleDateString('en-US', { day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' })
}

export function HistoryAccordion({ carousels }: { carousels: CarouselItem[] }) {
  const [openId, setOpenId] = useState<string | null>(null)

  if (carousels.length === 0) {
    return <p className="text-sm text-ink-600/60 text-center py-12">No carousels in history.</p>
  }

  return (
    <div className="space-y-2">
      {carousels.map((c) => {
        const isOpen = openId === c.id
        const label = c.title || c.carousel_type || c.prompt || 'Untitled'

        return (
          <div key={c.id} className="bg-white rounded-xl2 shadow-soft overflow-hidden">
            <button
              onClick={() => setOpenId(isOpen ? null : c.id)}
              className="w-full flex items-center justify-between px-5 py-4 text-left hover:bg-cream-50 transition"
            >
              <div className="flex items-center gap-4 min-w-0">
                <span className="text-xs text-ink-600/50 shrink-0 font-mono">{formatDate(c.created_at)}</span>
                <span className="text-sm font-medium text-ink-900 truncate">{label}</span>
              </div>
              <ChevronDown
                size={16}
                className={`shrink-0 text-ink-600/50 transition-transform ${isOpen ? 'rotate-180' : ''}`}
              />
            </button>

            {isOpen && (
              <div className="border-t border-cream-100 px-5 py-4 space-y-4">
                {c.slides.map((slide) => {
                  const texts = Object.entries(slide.text_fields || {})
                  if (texts.length === 0) return null
                  return (
                    <div key={slide.index} className="space-y-1">
                      <p className="text-[10px] uppercase tracking-widest text-ink-600/40 font-mono">
                        Slide {slide.index} — {slide.slide_type}
                      </p>
                      {texts.map(([role, text]) => (
                        <p key={role} className="text-sm text-ink-700 leading-relaxed">
                          {text}
                        </p>
                      ))}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}
