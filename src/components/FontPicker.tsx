'use client'

import { useState, useRef, useEffect } from 'react'
import { ChevronDown, Search, Upload, X, Loader2 } from 'lucide-react'
import { GOOGLE_FONTS, type GoogleFont } from '@/lib/google-fonts'
import { useUserFonts, injectFontFace, type UserFont } from '@/lib/user-fonts-context'

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
  const [uploading, setUploading] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const fileRef = useRef<HTMLInputElement>(null)
  const { fonts: customFonts, reload } = useUserFonts()

  useEffect(() => {
    function onClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', onClickOutside)
    return () => document.removeEventListener('mousedown', onClickOutside)
  }, [])

  const q = search.toLowerCase()

  const filteredCustom = customFonts.filter((f) =>
    f.family_name.toLowerCase().includes(q)
  )
  const filteredGoogle = GOOGLE_FONTS.filter((f) =>
    f.family.toLowerCase().includes(q)
  )

  // Group Google fonts by category
  const grouped = filteredGoogle.reduce<Record<string, GoogleFont[]>>((acc, f) => {
    if (!acc[f.category]) acc[f.category] = []
    acc[f.category].push(f)
    return acc
  }, {})

  async function handleFileChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload-font', { method: 'POST', body: fd })
      if (!res.ok) {
        const { error } = await res.json()
        alert(error || 'Erreur lors de l\'upload')
        return
      }
      const font: UserFont = await res.json()
      injectFontFace(font.family_name, font.url)
      await reload()
      onChange(font.family_name)
      setOpen(false)
      setSearch('')
    } catch {
      alert('Erreur lors de l\'upload')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  async function handleRemove(e: React.MouseEvent, id: string) {
    e.stopPropagation()
    const supabase = (await import('@/lib/supabase/client')).createClient()
    await supabase.from('user_fonts').delete().eq('id', id)
    await reload()
    // If removed font was selected, reset
    const removed = customFonts.find((f) => f.id === id)
    if (removed && value === removed.family_name) onChange('Inter')
  }

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
          {/* Search + upload */}
          <div className="p-2 border-b border-cream-100 flex gap-1.5">
            <div className="relative flex-1">
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
            <button
              type="button"
              onClick={() => fileRef.current?.click()}
              disabled={uploading}
              title="Importer une police (.ttf, .otf, .woff, .woff2)"
              className="flex items-center justify-center w-8 h-8 rounded-lg bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-50 shrink-0"
            >
              {uploading ? <Loader2 size={12} className="animate-spin" /> : <Upload size={12} />}
            </button>
            <input
              ref={fileRef}
              type="file"
              accept=".ttf,.otf,.woff,.woff2"
              className="hidden"
              onChange={handleFileChange}
            />
          </div>

          <div className="overflow-y-auto flex-1">
            {/* Custom fonts section */}
            {filteredCustom.length > 0 && (
              <div>
                <div className="px-3 py-1 text-[9px] uppercase tracking-wider text-ink-600/60 bg-pastel-lavender/40 sticky top-0">
                  Mes polices
                </div>
                {filteredCustom.map((f) => (
                  <div
                    key={f.id}
                    className={`flex items-center pr-1 hover:bg-cream-100 transition ${
                      value === f.family_name ? 'bg-pastel-lavender' : ''
                    }`}
                  >
                    <button
                      onClick={() => {
                        onChange(f.family_name)
                        setOpen(false)
                        setSearch('')
                      }}
                      className="flex-1 text-left px-3 py-2 text-sm"
                      style={{ fontFamily: f.family_name }}
                    >
                      {f.family_name}
                    </button>
                    <button
                      onClick={(e) => handleRemove(e, f.id)}
                      className="p-1 rounded hover:bg-red-100 text-ink-400 hover:text-red-500 shrink-0"
                      title="Supprimer cette police"
                    >
                      <X size={10} />
                    </button>
                  </div>
                ))}
              </div>
            )}

            {/* Google fonts */}
            {filteredCustom.length === 0 && filteredGoogle.length === 0 && (
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
