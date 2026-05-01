'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search } from 'lucide-react'
import { GOOGLE_FONTS, type GoogleFont } from '@/lib/google-fonts'

type Props = {
  value: string
  onChange: (family: string) => void
}

const CATEGORY_LABEL: Record<GoogleFont['category'], string> = {
  sans: 'Sans serif',
  serif: 'Serif',
  display: 'Display',
  handwriting: 'Manuscrite',
  mono: 'Mono',
}

export function FontPicker({ value, onChange }: Props) {
  const [open, setOpen] = useState(false)
  const [search, setSearch] = useState('')
  const containerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const filtered = GOOGLE_FONTS.filter((f) =>
    f.family.toLowerCase().includes(search.toLowerCase())
  )

  // Group by category
  const grouped = filtered.reduce<Record<string, GoogleFont[]>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = []
    acc[f.category].push(f)
    return acc
  }, {})

  return (
    <div className="relative" ref={containerRef}>
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="input text-xs py-1.5 flex items-center justify-between w-full text-left"
        style={{ fontFamily: value }}
      >
        <span className="truncate">{value || 'Choisir une police'}</span>
        <ChevronDown size={12} className="shrink-0 ml-2" />
      </button>

      {open && (
        <div className="absolute z-50 mt-1 w-full bg-white rounded-xl shadow-card border border-cream-200 max-h-80 overflow-hidden flex flex-col">
          <div className="p-2 border-b border-cream-100">
            <div className="relative">
              <Search size={12} className="absolute left-2.5 top-1/2 -translate-y-1/2 text-ink-600/50" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Rechercher..."
                className="w-full pl-7 pr-2 py-1.5 text-xs rounded-lg bg-cream-50 focus:outline-none focus:ring-1 focus:ring-ink-900/20"
                autoFocus
              />
            </div>
          </div>

          <div className="overflow-y-auto flex-1">
            {Object.keys(grouped).length === 0 && (
              <div className="px-3 py-6 text-center text-xs text-ink-600/50">
                Aucune police trouvée
              </div>
            )}
            {(['sans', 'serif', 'display', 'handwriting', 'mono'] as const).map((cat) => {
              const fonts = grouped[cat]
              if (!fonts || fonts.length === 0) return null
              return (
                <div key={cat}>
                  <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-ink-600/60 bg-cream-50 sticky top-0">
                    {CATEGORY_LABEL[cat]}
                  </div>
                  {fonts.map((f) => (
                    <button
                      key={f.family}
                      onClick={() => {
                        onChange(f.family)
                        setOpen(false)
                        setSearch('')
                      }}
                      className={`w-full text-left px-3 py-2 text-sm hover:bg-cream-100 transition ${
                        value === f.family ? 'bg-pastel-lavender' : ''
                      }`}
                      style={{ fontFamily: f.family }}
                    >
                      {f.family}
                    </button>
                  ))}
                </div>
              )
            })}
          </div>
        </div>
      )}
    </div>
  )
}
