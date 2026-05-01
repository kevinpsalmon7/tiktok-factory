'use client'

import { useEffect, useRef, useState } from 'react'
import dynamic from 'next/dynamic'
import { useRouter } from 'next/navigation'
import {
  ArrowLeft,
  Plus,
  Trash2,
  Save,
  Type,
  Image as ImageIcon,
  Square,
  ChevronUp,
  ChevronDown,
  Eye,
  EyeOff,
  FileText,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import type {
  TemplateLayout,
  TemplateElement,
  TextElement,
  ImageElement,
  RectElement,
} from '@/types/database'

// Konva requires a window object — load canvas client-side only
const BuilderCanvas = dynamic(
  () => import('@/components/TemplateBuilder/Canvas').then((m) => m.BuilderCanvas),
  { ssr: false }
)

type InitialTemplate = {
  id: string
  name: string
  description: string
  layout: TemplateLayout
  style_guide: string
  carousel_instructions: string
  gemini_instructions: string
  platforms: string[]
}

type Tab = 'design' | 'style' | 'prompt' | 'gemini'

const SLIDE_TYPES = ['title', 'content', 'cta'] as const

export function TemplateEditor({ initialTemplate }: { initialTemplate: InitialTemplate }) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('design')
  const [name, setName] = useState(initialTemplate.name)
  const [description, setDescription] = useState(initialTemplate.description)
  const [layout, setLayout] = useState<TemplateLayout>(initialTemplate.layout)
  const [styleGuide, setStyleGuide] = useState(initialTemplate.style_guide)
  const [carouselInstructions, setCarouselInstructions] = useState(
    initialTemplate.carousel_instructions
  )
  const [geminiInstructions, setGeminiInstructions] = useState(initialTemplate.gemini_instructions)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeSlideType, setActiveSlideType] = useState<(typeof SLIDE_TYPES)[number]>('content')
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)

  // Responsive stage sizing
  const stageWrapperRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ w: 420, h: 747 })
  useEffect(() => {
    const el = stageWrapperRef.current
    if (!el) return
    const ro = new ResizeObserver(() => {
      const availW = el.clientWidth - 24
      const availH = el.clientHeight - 24
      const ratio = layout.height / layout.width
      let w = availW
      let h = w * ratio
      if (h > availH) {
        h = availH
        w = h / ratio
      }
      setStageSize({ w: Math.floor(w), h: Math.floor(h) })
    })
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout.width, layout.height])

  const selectedElement = layout.elements.find((el) => el.id === selectedId) || null

  function updateElement(id: string, patch: Partial<TemplateElement>) {
    setLayout((l) => ({
      ...l,
      elements: l.elements.map((el) => (el.id === id ? ({ ...el, ...patch } as TemplateElement) : el)),
    }))
  }

  function addElement(type: 'text' | 'image' | 'rect') {
    const id = `${type}_${Date.now()}`
    const maxZ = Math.max(0, ...layout.elements.map((el) => el.zIndex))
    const base = {
      id,
      x: 200,
      y: 200,
      width: 600,
      height: type === 'text' ? 150 : 400,
      zIndex: maxZ + 1,
      opacity: 1,
    }
    let newEl: TemplateElement
    if (type === 'text') {
      newEl = {
        ...base,
        type: 'text',
        field: 'heading_text',
        fontSize: 54,
        fontFamily: 'Inter',
        fontWeight: 700,
        color: '#000000',
        backgroundColor: '#ffffff',
        padding: 8,
        placeholder: 'Nouveau texte',
        slideTypes: ['title', 'content', 'cta'],
      } satisfies TextElement
    } else if (type === 'image') {
      newEl = {
        ...base,
        type: 'image',
        source: 'generated',
        fit: 'cover',
      } satisfies ImageElement
    } else {
      newEl = {
        ...base,
        type: 'rect',
        fill: '#f1b5c6',
        cornerRadius: 12,
      } satisfies RectElement
    }
    setLayout((l) => ({ ...l, elements: [...l.elements, newEl] }))
    setSelectedId(id)
  }

  function removeElement(id: string) {
    setLayout((l) => ({ ...l, elements: l.elements.filter((el) => el.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  function reorder(id: string, direction: 'up' | 'down') {
    const els = [...layout.elements].sort((a, b) => a.zIndex - b.zIndex)
    const i = els.findIndex((el) => el.id === id)
    if (i < 0) return
    const j = direction === 'up' ? i + 1 : i - 1
    if (j < 0 || j >= els.length) return
    const tmpZ = els[i].zIndex
    els[i].zIndex = els[j].zIndex
    els[j].zIndex = tmpZ
    setLayout((l) => ({ ...l, elements: [...els] }))
  }

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('templates') as any)
      .update({
        name,
        description,
        layout,
        style_guide: styleGuide,
        carousel_instructions: carouselInstructions,
        gemini_instructions: geminiInstructions,
      })
      .eq('id', initialTemplate.id)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer le template "${name}" ?`)) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('templates').delete().eq('id', initialTemplate.id)
    router.push('/templates')
  }

  return (
    <div className="h-[calc(100vh-80px)] flex flex-col gap-4 -mx-6 px-6">
      {/* Header */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-3 flex-1 min-w-0">
          <button
            onClick={() => router.push('/templates')}
            className="p-2 rounded-full bg-white shadow-soft hover:shadow-card"
          >
            <ArrowLeft size={16} />
          </button>
          <input
            value={name}
            onChange={(e) => setName(e.target.value)}
            className="font-display text-2xl font-semibold bg-transparent border-none outline-none focus:ring-2 focus:ring-ink-900/10 rounded px-2 -ml-2 flex-1 min-w-0"
          />
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2.5 rounded-full bg-white text-red-600 shadow-soft hover:shadow-card hover:bg-red-50"
            title="Supprimer"
          >
            <Trash2 size={16} />
          </button>
          {saved && (
            <div className="px-3 py-2 rounded-full bg-pastel-mint text-ink-900 text-xs font-medium">
              ✓ Enregistré
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? 'Enregistrement...' : 'Enregistrer'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-full p-1 w-fit shadow-soft">
        <TabButton active={tab === 'design'} onClick={() => setTab('design')}>
          Design
        </TabButton>
        <TabButton active={tab === 'style'} onClick={() => setTab('style')}>
          Style guide
        </TabButton>
        <TabButton active={tab === 'prompt'} onClick={() => setTab('prompt')}>
          Instructions
        </TabButton>
        <TabButton active={tab === 'gemini'} onClick={() => setTab('gemini')}>
          Images (Gemini)
        </TabButton>
      </div>

      {/* Content */}
      {tab === 'design' ? (
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left: layers panel */}
          <div className="w-60 bg-white rounded-xl2 shadow-soft p-3 flex flex-col gap-2 overflow-y-auto">
            <div className="flex items-center justify-between px-2 py-1">
              <span className="text-xs font-medium uppercase tracking-wide text-ink-600">
                Éléments
              </span>
            </div>
            <div className="flex gap-1">
              <IconButton onClick={() => addElement('text')} title="Texte">
                <Type size={14} />
              </IconButton>
              <IconButton onClick={() => addElement('image')} title="Image">
                <ImageIcon size={14} />
              </IconButton>
              <IconButton onClick={() => addElement('rect')} title="Forme">
                <Square size={14} />
              </IconButton>
            </div>
            <div className="flex flex-col gap-1 mt-2">
              {[...layout.elements]
                .sort((a, b) => b.zIndex - a.zIndex)
                .map((el) => (
                  <LayerItem
                    key={el.id}
                    element={el}
                    selected={el.id === selectedId}
                    onSelect={() => setSelectedId(el.id)}
                    onRemove={() => removeElement(el.id)}
                    onMoveUp={() => reorder(el.id, 'up')}
                    onMoveDown={() => reorder(el.id, 'down')}
                  />
                ))}
            </div>
          </div>

          {/* Center: canvas */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs text-ink-600">Aperçu slide :</span>
              {SLIDE_TYPES.map((st) => (
                <button
                  key={st}
                  onClick={() => setActiveSlideType(st)}
                  className={`px-3 py-1 text-xs rounded-full transition ${
                    activeSlideType === st
                      ? 'bg-ink-900 text-white'
                      : 'bg-white text-ink-700 hover:bg-cream-100'
                  }`}
                >
                  {st}
                </button>
              ))}
            </div>
            <div
              ref={stageWrapperRef}
              className="flex-1 flex items-center justify-center bg-cream-100 rounded-xl2 overflow-hidden p-3"
            >
              <BuilderCanvas
                layout={layout}
                selectedId={selectedId}
                onSelect={setSelectedId}
                onUpdate={updateElement}
                activeSlideType={activeSlideType}
                stageWidth={stageSize.w}
                stageHeight={stageSize.h}
              />
            </div>
          </div>

          {/* Right: properties panel */}
          <div className="w-72 bg-white rounded-xl2 shadow-soft p-4 overflow-y-auto">
            {selectedElement ? (
              <PropertiesPanel
                element={selectedElement}
                onChange={(patch) => updateElement(selectedElement.id, patch)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-ink-600/60 text-sm text-center">
                <FileText size={32} className="mb-2 opacity-40" />
                Sélectionnez un élément pour modifier ses propriétés
              </div>
            )}
          </div>
        </div>
      ) : tab === 'style' ? (
        <div className="flex-1 bg-white rounded-xl2 shadow-soft p-6 overflow-y-auto">
          <h2 className="font-display text-xl font-semibold mb-1">Style guide</h2>
          <p className="text-sm text-ink-600 mb-4">
            Règles de style, ton, ponctuation — lues par Claude pour chaque génération.
          </p>
          <textarea
            className="textarea min-h-[400px] font-mono text-xs"
            value={styleGuide}
            onChange={(e) => setStyleGuide(e.target.value)}
          />
        </div>
      ) : tab === 'prompt' ? (
        <div className="flex-1 bg-white rounded-xl2 shadow-soft p-6 overflow-y-auto">
          <h2 className="font-display text-xl font-semibold mb-1">Instructions carousel</h2>
          <p className="text-sm text-ink-600 mb-4">
            Structure attendue, nombre de slides, champs à remplir. Claude génère un JSON suivant ces consignes.
          </p>
          <textarea
            className="textarea min-h-[400px] font-mono text-xs"
            value={carouselInstructions}
            onChange={(e) => setCarouselInstructions(e.target.value)}
          />
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-xl2 shadow-soft p-6 overflow-y-auto">
          <h2 className="font-display text-xl font-semibold mb-1">Instructions image (Gemini)</h2>
          <p className="text-sm text-ink-600 mb-4">
            Style global appliqué à toutes les images générées (palette, composition, ambiance).
            Combiné avec le <code>illustration_prompt</code> spécifique de chaque slide.
          </p>
          <textarea
            className="textarea min-h-[400px]"
            value={geminiInstructions}
            onChange={(e) => setGeminiInstructions(e.target.value)}
          />
        </div>
      )}
    </div>
  )
}

function TabButton({
  children,
  active,
  onClick,
}: {
  children: React.ReactNode
  active: boolean
  onClick: () => void
}) {
  return (
    <button
      onClick={onClick}
      className={`px-4 py-1.5 text-xs font-medium rounded-full transition ${
        active ? 'bg-ink-900 text-white' : 'text-ink-700 hover:bg-cream-100'
      }`}
    >
      {children}
    </button>
  )
}

function IconButton({
  children,
  onClick,
  title,
}: {
  children: React.ReactNode
  onClick: () => void
  title?: string
}) {
  return (
    <button
      onClick={onClick}
      title={title}
      className="flex-1 py-2 rounded-lg bg-cream-100 hover:bg-cream-200 text-ink-700 flex items-center justify-center transition"
    >
      {children}
    </button>
  )
}

function LayerItem({
  element,
  selected,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
}: {
  element: TemplateElement
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
}) {
  const Icon = element.type === 'text' ? Type : element.type === 'image' ? ImageIcon : Square
  const label =
    element.type === 'text'
      ? (element as TextElement).field
      : element.type === 'image'
      ? 'Image'
      : 'Forme'

  return (
    <div
      className={`flex items-center gap-1 p-1.5 rounded-lg text-xs cursor-pointer transition ${
        selected ? 'bg-pastel-lavender' : 'hover:bg-cream-100'
      }`}
      onClick={onSelect}
    >
      <Icon size={12} className="text-ink-700 shrink-0" />
      <span className="flex-1 truncate">{label}</span>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onMoveUp()
        }}
        className="p-0.5 hover:bg-white/50 rounded"
      >
        <ChevronUp size={12} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onMoveDown()
        }}
        className="p-0.5 hover:bg-white/50 rounded"
      >
        <ChevronDown size={12} />
      </button>
      <button
        onClick={(e) => {
          e.stopPropagation()
          onRemove()
        }}
        className="p-0.5 hover:bg-red-100 text-red-600 rounded"
      >
        <Trash2 size={12} />
      </button>
    </div>
  )
}

function PropertiesPanel({
  element,
  onChange,
}: {
  element: TemplateElement
  onChange: (patch: Partial<TemplateElement>) => void
}) {
  return (
    <div className="space-y-3 text-xs">
      <div className="text-[10px] uppercase tracking-wide text-ink-600 font-medium">
        {element.type}
      </div>

      {/* Slide types filter */}
      <div>
        <label className="block text-[10px] text-ink-600 mb-1">Visible sur</label>
        <div className="flex gap-1 flex-wrap">
          {SLIDE_TYPES.map((st) => {
            const active = !element.slideTypes || element.slideTypes.includes(st)
            return (
              <button
                key={st}
                onClick={() => {
                  const current = element.slideTypes || [...SLIDE_TYPES]
                  const next = active
                    ? current.filter((x) => x !== st)
                    : [...current, st]
                  onChange({ slideTypes: next })
                }}
                className={`px-2 py-1 rounded-full text-[10px] ${
                  active ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
                }`}
              >
                {active ? <Eye size={10} className="inline mr-1" /> : <EyeOff size={10} className="inline mr-1" />}
                {st}
              </button>
            )
          })}
        </div>
      </div>

      {/* Position + size */}
      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={element.x} onChange={(v) => onChange({ x: v })} />
        <NumberField label="Y" value={element.y} onChange={(v) => onChange({ y: v })} />
        <NumberField label="W" value={element.width} onChange={(v) => onChange({ width: v })} />
        <NumberField label="H" value={element.height} onChange={(v) => onChange({ height: v })} />
      </div>

      {element.type === 'text' && (
        <TextProperties element={element as TextElement} onChange={onChange} />
      )}
      {element.type === 'image' && (
        <ImageProperties element={element as ImageElement} onChange={onChange} />
      )}
      {element.type === 'rect' && (
        <RectProperties element={element as RectElement} onChange={onChange} />
      )}
    </div>
  )
}

function NumberField({
  label,
  value,
  onChange,
}: {
  label: string
  value: number
  onChange: (v: number) => void
}) {
  return (
    <div>
      <label className="block text-[10px] text-ink-600 mb-0.5">{label}</label>
      <input
        type="number"
        className="input text-xs py-1.5"
        value={Math.round(value)}
        onChange={(e) => onChange(parseFloat(e.target.value) || 0)}
      />
    </div>
  )
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
}) {
  return (
    <div>
      <label className="block text-[10px] text-ink-600 mb-0.5">{label}</label>
      <input
        type="text"
        className="input text-xs py-1.5"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
      />
    </div>
  )
}

function TextProperties({
  element,
  onChange,
}: {
  element: TextElement
  onChange: (patch: Partial<TextElement>) => void
}) {
  return (
    <>
      <TextField
        label="Champ lié (ex: heading_text)"
        value={element.field}
        onChange={(v) => onChange({ field: v })}
      />
      <TextField
        label="Placeholder"
        value={element.placeholder || ''}
        onChange={(v) => onChange({ placeholder: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Taille"
          value={element.fontSize}
          onChange={(v) => onChange({ fontSize: v })}
        />
        <div>
          <label className="block text-[10px] text-ink-600 mb-0.5">Poids</label>
          <select
            className="input text-xs py-1.5"
            value={String(element.fontWeight || 400)}
            onChange={(e) => onChange({ fontWeight: parseInt(e.target.value) })}
          >
            <option value="400">Regular</option>
            <option value="500">Medium</option>
            <option value="600">Semi-bold</option>
            <option value="700">Bold</option>
          </select>
        </div>
      </div>
      <TextField
        label="Police"
        value={element.fontFamily}
        onChange={(v) => onChange({ fontFamily: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <ColorField
          label="Couleur"
          value={element.color}
          onChange={(v) => onChange({ color: v })}
        />
        <ColorField
          label="Fond"
          value={element.backgroundColor || ''}
          onChange={(v) => onChange({ backgroundColor: v || undefined })}
        />
      </div>
      <div>
        <label className="block text-[10px] text-ink-600 mb-0.5">Alignement</label>
        <div className="flex gap-1">
          {(['left', 'center', 'right'] as const).map((a) => (
            <button
              key={a}
              onClick={() => onChange({ align: a })}
              className={`flex-1 py-1.5 rounded-lg text-[10px] ${
                element.align === a ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
              }`}
            >
              {a}
            </button>
          ))}
        </div>
      </div>
    </>
  )
}

function ImageProperties({
  element,
  onChange,
}: {
  element: ImageElement
  onChange: (patch: Partial<ImageElement>) => void
}) {
  return (
    <>
      <div>
        <label className="block text-[10px] text-ink-600 mb-0.5">Source</label>
        <div className="flex gap-1">
          <button
            onClick={() => onChange({ source: 'generated' })}
            className={`flex-1 py-1.5 rounded-lg text-[10px] ${
              element.source === 'generated' ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
            }`}
          >
            Gemini
          </button>
          <button
            onClick={() => onChange({ source: 'asset' })}
            className={`flex-1 py-1.5 rounded-lg text-[10px] ${
              element.source === 'asset' ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
            }`}
          >
            URL fixe
          </button>
        </div>
      </div>
      {element.source === 'asset' && (
        <TextField
          label="URL de l'image"
          value={element.assetUrl || ''}
          onChange={(v) => onChange({ assetUrl: v })}
          placeholder="https://..."
        />
      )}
    </>
  )
}

function RectProperties({
  element,
  onChange,
}: {
  element: RectElement
  onChange: (patch: Partial<RectElement>) => void
}) {
  return (
    <>
      <ColorField
        label="Remplissage"
        value={element.fill}
        onChange={(v) => onChange({ fill: v })}
      />
      <NumberField
        label="Rayon coin"
        value={element.cornerRadius || 0}
        onChange={(v) => onChange({ cornerRadius: v })}
      />
    </>
  )
}

function ColorField({
  label,
  value,
  onChange,
}: {
  label: string
  value: string
  onChange: (v: string) => void
}) {
  return (
    <div>
      <label className="block text-[10px] text-ink-600 mb-0.5">{label}</label>
      <div className="flex gap-1">
        <input
          type="color"
          value={value || '#ffffff'}
          onChange={(e) => onChange(e.target.value)}
          className="w-8 h-8 rounded cursor-pointer"
        />
        <input
          type="text"
          value={value}
          onChange={(e) => onChange(e.target.value)}
          className="input text-xs py-1.5 flex-1 font-mono"
          placeholder="#000000"
        />
      </div>
    </div>
  )
}
