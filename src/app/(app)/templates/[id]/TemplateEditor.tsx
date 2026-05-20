'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
import { InstructionBudgetGauge } from './InstructionBudgetGauge'
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
  FileText,
  Undo2,
  Redo2,
  Pencil,
  Check,
  X,
  Magnet,
  Eye,
  EyeOff,
  AlignStartHorizontal,
  AlignCenterHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignCenterVertical,
  AlignEndVertical,
  Lock as LockIcon,
  Unlock as UnlockIcon,
  Upload,
  Copy,
  ChevronRight,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { FontPicker } from '@/components/FontPicker'
import { ReferencesPanel } from '@/components/TemplateBuilder/ReferencesPanel'
import { PagesTab } from './PagesTab'
import { BackgroundsTab } from './BackgroundsTab'
import type {
  TemplateLayout,
  TemplateElement,
  TextElement,
  ImageElement,
  RectElement,
  TextRole,
  TextParagraph,
} from '@/types/database'

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
  avatar_instructions: string
  randomization_instructions: string
  absolute_rules: string
  platforms: string[]
}

type Tab = 'design' | 'instructions' | 'references' | 'pages' | 'backgrounds'

const HISTORY_LIMIT = 10

function roleDefaults(role: TextRole, baseSize: number): Pick<TextParagraph, 'fontSize' | 'fontWeight'> {
  const sz: Record<TextRole, number> = { title: baseSize, subtitle: Math.round(baseSize * 0.65), text: Math.round(baseSize * 0.45) }
  const fw: Record<TextRole, number> = { title: 700, subtitle: 600, text: 400 }
  return { fontSize: sz[role], fontWeight: fw[role] }
}

const ROLE_OPTIONS: { value: TextRole; label: string }[] = [
  { value: 'title', label: 'Title' },
  { value: 'subtitle', label: 'Subtitle' },
  { value: 'text', label: 'Text' },
]

type TemplateEditorProps = {
  initialTemplate: InitialTemplate
  userId: string
  anthropicApiKey: string | null
}

export function TemplateEditor({ initialTemplate, userId, anthropicApiKey }: TemplateEditorProps) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('design')
  const [name, setName] = useState(initialTemplate.name)
  const [description] = useState(initialTemplate.description)
  const [styleGuide, setStyleGuide] = useState(initialTemplate.style_guide)
  const [carouselInstructions, setCarouselInstructions] = useState(
    initialTemplate.carousel_instructions
  )
  const [geminiInstructions, setGeminiInstructions] = useState(initialTemplate.gemini_instructions)
  const [avatarInstructions, setAvatarInstructions] = useState(initialTemplate.avatar_instructions)
  const [randomizationInstructions, setRandomizationInstructions] = useState(initialTemplate.randomization_instructions)
  const [absoluteRules, setAbsoluteRules] = useState(initialTemplate.absolute_rules)

  // Normalize incoming layout so older saves still work with the new model.
  const normalizedInitial = useMemo(
    () => normalizeLayout(initialTemplate.layout),
    [initialTemplate.layout]
  )

  // Layout history for undo/redo
  const [history, setHistory] = useState<TemplateLayout[]>([normalizedInitial])
  const [historyIndex, setHistoryIndex] = useState(0)
  const layout = history[historyIndex]

  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [activeSlideType, setActiveSlideType] = useState<string>(
    normalizedInitial.slideTypes[0] || 'content'
  )
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [snapEnabled, setSnapEnabled] = useState(false)
  const [showGuides, setShowGuides] = useState(true)
  const [renamingType, setRenamingType] = useState<string | null>(null)
  const [renameValue, setRenameValue] = useState('')

  // Push a new layout state onto the history stack (capped at HISTORY_LIMIT).
  // IMPORTANT: setHistoryIndex must be called OUTSIDE the setHistory callback —
  // calling one setState inside another setState updater is incorrect React and
  // can cause the two states to desync (manifests as changes appearing to rollback).
  const pushLayout = useCallback(
    (next: TemplateLayout | ((prev: TemplateLayout) => TemplateLayout)) => {
      setHistory((hist) => {
        const base = hist[historyIndex]
        const nextLayout = typeof next === 'function' ? next(base) : next
        const truncated = hist.slice(0, historyIndex + 1)
        const pushed = [...truncated, nextLayout]
        const overflow = pushed.length - HISTORY_LIMIT
        if (overflow > 0) pushed.splice(0, overflow)
        return pushed
      })
      // Compute the new index from historyIndex alone (no need for latest hist array):
      // truncated has (historyIndex + 1) items, after push → min(historyIndex + 2, HISTORY_LIMIT)
      setHistoryIndex(Math.min(historyIndex + 1, HISTORY_LIMIT - 1))
    },
    [historyIndex]
  )

  // Patch the CURRENT history slot in place — no new history entry, no index change.
  // Used for live updates during drag/resize so that every pixel doesn't create
  // a separate undo step. The final committed value is written by pushLayout.
  const patchCurrentLayout = useCallback(
    (next: TemplateLayout | ((prev: TemplateLayout) => TemplateLayout)) => {
      setHistory((hist) => {
        const base = hist[historyIndex]
        const nextLayout = typeof next === 'function' ? next(base) : next
        const newHist = [...hist]
        newHist[historyIndex] = nextLayout
        return newHist
      })
      // historyIndex intentionally unchanged
    },
    [historyIndex]
  )

  const canUndo = historyIndex > 0
  const canRedo = historyIndex < history.length - 1

  const undo = useCallback(() => {
    if (canUndo) setHistoryIndex((i) => i - 1)
  }, [canUndo])
  const redo = useCallback(() => {
    if (canRedo) setHistoryIndex((i) => i + 1)
  }, [canRedo])

  // Keyboard shortcuts: Cmd/Ctrl+Z = undo, Cmd/Ctrl+Shift+Z or Cmd/Ctrl+Y = redo
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isEditing =
        document.activeElement &&
        ['INPUT', 'TEXTAREA'].includes(document.activeElement.tagName)
      if (isEditing) return
      const meta = e.metaKey || e.ctrlKey
      if (!meta) return
      if (e.key === 'z' && !e.shiftKey) {
        e.preventDefault()
        undo()
      } else if ((e.key === 'z' && e.shiftKey) || e.key === 'y') {
        e.preventDefault()
        redo()
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [undo, redo])

  // Responsive stage sizing — re-measure when layout or tab changes so that
  // coming back to the Design tab shows the canvas at the right size.
  const stageWrapperRef = useRef<HTMLDivElement>(null)
  const [stageSize, setStageSize] = useState({ w: 420, h: 747 })
  useEffect(() => {
    if (tab !== 'design') return
    const el = stageWrapperRef.current
    if (!el) return
    const measure = () => {
      const availW = el.clientWidth - 24
      const availH = el.clientHeight - 24
      if (availW <= 0 || availH <= 0) return
      const ratio = layout.height / layout.width
      let w = availW
      let h = w * ratio
      if (h > availH) {
        h = availH
        w = h / ratio
      }
      setStageSize({ w: Math.floor(w), h: Math.floor(h) })
    }
    measure()
    const ro = new ResizeObserver(measure)
    ro.observe(el)
    return () => ro.disconnect()
  }, [layout.width, layout.height, tab])

  const selectedElement = layout.elements.find((el) => el.id === selectedId) || null

  // Ensure active slide type is always valid
  useEffect(() => {
    if (!layout.slideTypes.includes(activeSlideType)) {
      setActiveSlideType(layout.slideTypes[0] || '')
    }
  }, [layout.slideTypes, activeSlideType])

  function updateElement(id: string, patch: Partial<TemplateElement>) {
    pushLayout((l) => ({
      ...l,
      elements: l.elements.map((el) =>
        el.id === id ? ({ ...el, ...patch } as TemplateElement) : el
      ),
    }))
  }

  // Live update: overwrites the current history slot without creating a new entry.
  // Used during drag/resize to avoid flooding history with per-pixel states.
  function updateElementLive(id: string, patch: Partial<TemplateElement>) {
    patchCurrentLayout((l) => ({
      ...l,
      elements: l.elements.map((el) =>
        el.id === id ? ({ ...el, ...patch } as TemplateElement) : el
      ),
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
      slideType: activeSlideType,
    }
    let newEl: TemplateElement
    if (type === 'text') {
      newEl = {
        ...base,
        type: 'text',
        role: 'text',
        fontSize: 54,
        fontFamily: 'Inter',
        fontWeight: 700,
        color: '#000000',
        backgroundColor: '#ffffff',
        bgMode: 'inline',
        padding: 8,
        paragraphs: [{ role: 'title' as TextRole, fontFamily: 'Inter', ...roleDefaults('title', 54) }],
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
        fill: '#ffffff',
        cornerRadius: 0,
      } satisfies RectElement
    }
    pushLayout((l) => ({ ...l, elements: [...l.elements, newEl] }))
    setSelectedId(id)
  }

  function removeElement(id: string) {
    pushLayout((l) => ({ ...l, elements: l.elements.filter((el) => el.id !== id) }))
    if (selectedId === id) setSelectedId(null)
  }

  function reorder(id: string, direction: 'up' | 'down') {
    // Photoshop-style: the layout.elements array order IS the z-order.
    // First in array = behind, last in array = front.
    // Panel is displayed reversed, so "up" in the panel = move toward array end = front.
    pushLayout((l) => {
      const i = l.elements.findIndex((el) => el.id === id)
      if (i < 0) return l
      const slideType = l.elements[i].slideType
      const step = direction === 'up' ? 1 : -1
      // Find the nearest neighbour of the same slideType in that direction.
      let j = i + step
      while (
        j >= 0 &&
        j < l.elements.length &&
        l.elements[j].slideType !== slideType
      ) {
        j += step
      }
      if (j < 0 || j >= l.elements.length) return l
      const newEls = [...l.elements]
      ;[newEls[i], newEls[j]] = [newEls[j], newEls[i]]
      // Keep zIndex values in sync with array order: re-assign them in sorted
      // order so that position 0 (back) always has the smallest zIndex, and the
      // last position (front) always has the largest. This ensures the Konva
      // renderer (which sorts by zIndex) always matches the builder's layer order.
      const zOrder = l.elements.map((e) => e.zIndex).sort((a, b) => a - b)
      return {
        ...l,
        elements: newEls.map((el, idx) => ({ ...el, zIndex: zOrder[idx] })),
      }
    })
  }

  function toggleLock(id: string) {
    pushLayout((l) => ({
      ...l,
      elements: l.elements.map((el) =>
        el.id === id ? ({ ...el, locked: !el.locked } as TemplateElement) : el
      ),
    }))
  }

  function updatePadding(key: 'top' | 'right' | 'bottom' | 'left', value: number) {
    pushLayout((l) => ({
      ...l,
      padding: { ...(l.padding || { top: 0, right: 0, bottom: 0, left: 0 }), [key]: value },
    }))
  }

  function addSlideType() {
    const base = 'slide'
    let i = layout.slideTypes.length + 1
    let candidate = `${base}${i}`
    while (layout.slideTypes.includes(candidate)) {
      i++
      candidate = `${base}${i}`
    }
    pushLayout((l) => ({ ...l, slideTypes: [...l.slideTypes, candidate] }))
    setActiveSlideType(candidate)
  }

  function deleteSlideType(st: string) {
    if (layout.slideTypes.length <= 1) return
    if (
      !confirm(
        `Delete slide type "${st}"? All elements attached to this type will be removed.`
      )
    )
      return
    pushLayout((l) => ({
      ...l,
      slideTypes: l.slideTypes.filter((x) => x !== st),
      elements: l.elements.filter((el) => el.slideType !== st),
    }))
  }

  function duplicateSlideType(st: string) {
    // Generate a unique name: "content" → "content2", "content2" → "content3", etc.
    let candidate = `${st}_copie`
    let i = 2
    while (layout.slideTypes.includes(candidate)) {
      candidate = `${st}_copie${i++}`
    }
    pushLayout((l) => {
      const newElements = l.elements
        .filter((el) => el.slideType === st)
        .map((el) => ({
          ...el,
          id: `${el.id}_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
          slideType: candidate,
        }))
      return {
        ...l,
        slideTypes: [...l.slideTypes, candidate],
        elements: [...l.elements, ...newElements],
      }
    })
    setActiveSlideType(candidate)
  }

  function commitRename() {
    if (!renamingType) return
    const newName = renameValue.trim()
    if (!newName || newName === renamingType) {
      setRenamingType(null)
      return
    }
    if (layout.slideTypes.includes(newName)) {
      alert('This name already exists')
      return
    }
    pushLayout((l) => ({
      ...l,
      slideTypes: l.slideTypes.map((x) => (x === renamingType ? newName : x)),
      elements: l.elements.map((el) =>
        el.slideType === renamingType ? { ...el, slideType: newName } : el
      ),
    }))
    if (activeSlideType === renamingType) setActiveSlideType(newName)
    setRenamingType(null)
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
        avatar_instructions: avatarInstructions,
        randomization_instructions: randomizationInstructions,
        absolute_rules: absoluteRules,
      })
      .eq('id', initialTemplate.id)
    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } else {
      alert('Error: ' + error.message)
    }
  }

  async function handleDelete() {
    if (!confirm(`Delete template "${name}"?`)) return
    setDeleting(true)
    const supabase = createClient()
    await supabase.from('templates').delete().eq('id', initialTemplate.id)
    router.push('/templates')
  }

  // Panel shows the reverse of array order so top of panel = front on canvas
  // (matches Photoshop). Array order is the source of truth for z-ordering.
  const visibleElementsForActiveType = useMemo(
    () =>
      layout.elements
        .filter((el) => el.slideType === activeSlideType)
        .slice()
        .reverse(),
    [layout.elements, activeSlideType]
  )

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
            onClick={undo}
            disabled={!canUndo}
            className="p-2.5 rounded-full bg-white shadow-soft hover:shadow-card disabled:opacity-40 disabled:cursor-not-allowed"
            title="Undo (Cmd+Z)"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2.5 rounded-full bg-white shadow-soft hover:shadow-card disabled:opacity-40 disabled:cursor-not-allowed"
            title="Redo (Cmd+Shift+Z)"
          >
            <Redo2 size={15} />
          </button>
          <button
            onClick={handleDelete}
            disabled={deleting}
            className="p-2.5 rounded-full bg-white text-red-600 shadow-soft hover:shadow-card hover:bg-red-50"
            title="Delete"
          >
            <Trash2 size={16} />
          </button>
          {saved && (
            <div className="px-3 py-2 rounded-full bg-pastel-mint text-ink-900 text-xs font-medium">
              ✓ Saved
            </div>
          )}
          <button
            onClick={handleSave}
            disabled={saving}
            className="inline-flex items-center gap-2 px-4 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 disabled:opacity-50"
          >
            <Save size={14} />
            {saving ? '...' : 'Save'}
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div className="flex items-center gap-1 bg-white rounded-full p-1 w-fit shadow-soft">
        <TabButton active={tab === 'design'} onClick={() => setTab('design')}>
          Design
        </TabButton>
        <TabButton active={tab === 'instructions'} onClick={() => setTab('instructions')}>
          Instructions
        </TabButton>
        <TabButton active={tab === 'references'} onClick={() => setTab('references')}>
          Visual references
        </TabButton>
        <TabButton active={tab === 'pages'} onClick={() => setTab('pages')}>
          Pages
        </TabButton>
        <TabButton active={tab === 'backgrounds'} onClick={() => setTab('backgrounds')}>
          Backgrounds
        </TabButton>
      </div>

      {tab === 'design' ? (
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left: layers panel + padding */}
          <div className="w-60 bg-white rounded-xl2 shadow-soft p-3 flex flex-col gap-3 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between px-2 py-1 mb-1">
                <span className="text-xs font-medium uppercase tracking-wide text-ink-600">
                  Elements
                </span>
              </div>
              <div className="flex gap-1">
                <IconButton onClick={() => addElement('text')} title="Text">
                  <Type size={14} />
                </IconButton>
                <IconButton onClick={() => addElement('image')} title="Image">
                  <ImageIcon size={14} />
                </IconButton>
                <IconButton onClick={() => addElement('rect')} title="Shape">
                  <Square size={14} />
                </IconButton>
              </div>
              <div className="flex flex-col gap-1 mt-2">
                {visibleElementsForActiveType.map((el) => (
                  <LayerItem
                    key={el.id}
                    element={el}
                    selected={el.id === selectedId}
                    onSelect={() => setSelectedId(el.id)}
                    onRemove={() => removeElement(el.id)}
                    onMoveUp={() => reorder(el.id, 'up')}
                    onMoveDown={() => reorder(el.id, 'down')}
                    onToggleLock={() => toggleLock(el.id)}
                  />
                ))}
                {visibleElementsForActiveType.length === 0 && (
                  <div className="px-2 py-3 text-[10px] text-ink-600/50 text-center">
                    No elements on this slide type
                  </div>
                )}
              </div>
            </div>

            {/* Padding / safe area */}
            <div className="border-t border-cream-100 pt-3">
              <div className="text-xs font-medium uppercase tracking-wide text-ink-600 px-2 mb-2">
                Padding
              </div>
              <div className="grid grid-cols-2 gap-2 px-1">
                <PaddingField
                  label="Top"
                  value={layout.padding?.top || 0}
                  onChange={(v) => updatePadding('top', v)}
                />
                <PaddingField
                  label="Right"
                  value={layout.padding?.right || 0}
                  onChange={(v) => updatePadding('right', v)}
                />
                <PaddingField
                  label="Bottom"
                  value={layout.padding?.bottom || 0}
                  onChange={(v) => updatePadding('bottom', v)}
                />
                <PaddingField
                  label="Left"
                  value={layout.padding?.left || 0}
                  onChange={(v) => updatePadding('left', v)}
                />
              </div>
              <p className="text-[10px] text-ink-600/60 px-2 mt-2">
                Purple guides on the canvas
              </p>
            </div>

            {/* Background color */}
            <div className="border-t border-cream-100 pt-3">
              <div className="text-xs font-medium uppercase tracking-wide text-ink-600 px-2 mb-2">
                Background
              </div>
              <div className="px-1">
                <ColorField
                  label="Background color"
                  value={layout.backgroundColor || '#ffffff'}
                  onChange={(v) => pushLayout((l) => ({ ...l, backgroundColor: v }))}
                />
              </div>
            </div>

            {/* Content slide range */}
            {layout.slideTypes.some(st => st === 'content' || st.startsWith('content')) && (
              <div className="border-t border-cream-100 pt-3">
                <div className="text-xs font-medium uppercase tracking-wide text-ink-600 px-2 mb-1">
                  Generation
                </div>
                <p className="text-[10px] text-ink-600/60 px-2 mb-2">
                  &ldquo;content&rdquo; slides to generate
                </p>
                <div className="grid grid-cols-2 gap-2 px-1">
                  <PaddingField
                    label="Min"
                    value={layout.contentSlideRange?.min ?? 5}
                    onChange={(v) => {
                      const newMin = Math.max(1, Math.min(20, v))
                      pushLayout((l) => ({
                        ...l,
                        contentSlideRange: {
                          min: newMin,
                          max: Math.max(newMin, l.contentSlideRange?.max ?? 8),
                        },
                      }))
                    }}
                  />
                  <PaddingField
                    label="Max"
                    value={layout.contentSlideRange?.max ?? 8}
                    onChange={(v) => {
                      const newMax = Math.max(1, Math.min(20, v))
                      pushLayout((l) => ({
                        ...l,
                        contentSlideRange: {
                          min: Math.min(l.contentSlideRange?.min ?? 5, newMax),
                          max: newMax,
                        },
                      }))
                    }}
                  />
                </div>
              </div>
            )}
          </div>

          {/* Center: canvas */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-ink-600">Slide:</span>
              {layout.slideTypes.map((st, idx) => (
                <div key={st} className="flex items-center gap-2">
                  {idx > 0 && (
                    <ChevronRight size={12} className="text-ink-400 shrink-0" />
                  )}
                  <SlideTypeTab
                    type={st}
                    active={activeSlideType === st}
                    renaming={renamingType === st}
                    renameValue={renameValue}
                    canDelete={layout.slideTypes.length > 1}
                    onSelect={() => setActiveSlideType(st)}
                    onStartRename={() => {
                      setRenamingType(st)
                      setRenameValue(st)
                    }}
                    onChangeRename={(v) => setRenameValue(v)}
                    onCommitRename={commitRename}
                    onCancelRename={() => setRenamingType(null)}
                    onDelete={() => deleteSlideType(st)}
                    onDuplicate={() => duplicateSlideType(st)}
                  />
                </div>
              ))}
              <button
                onClick={addSlideType}
                className="w-7 h-7 rounded-full bg-white hover:bg-cream-100 shadow-soft flex items-center justify-center"
                title="Add slide type"
              >
                <Plus size={14} />
              </button>
              <button
                onClick={() => setSnapEnabled((v) => !v)}
                className={`w-7 h-7 rounded-full shadow-soft flex items-center justify-center transition ${
                  snapEnabled
                    ? 'bg-ink-900 text-white'
                    : 'bg-white text-ink-700 hover:bg-cream-100'
                }`}
                title={snapEnabled ? 'Disable snap' : 'Enable snap'}
              >
                <Magnet size={14} />
              </button>
              <button
                onClick={() => setShowGuides((v) => !v)}
                className={`w-7 h-7 rounded-full shadow-soft flex items-center justify-center transition ${
                  showGuides
                    ? 'bg-ink-900 text-white'
                    : 'bg-white text-ink-700 hover:bg-cream-100'
                }`}
                title={showGuides ? 'Hide guides' : 'Show guides'}
              >
                {showGuides ? <Eye size={14} /> : <EyeOff size={14} />}
              </button>
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
                onUpdateLive={updateElementLive}
                activeSlideType={activeSlideType}
                stageWidth={stageSize.w}
                stageHeight={stageSize.h}
                snapEnabled={snapEnabled}
                showGuides={showGuides}
              />
            </div>
          </div>

          {/* Right: properties panel */}
          <div className="w-72 bg-white rounded-xl2 shadow-soft p-4 overflow-y-auto">
            {selectedElement ? (
              <PropertiesPanel
                element={selectedElement}
                layout={layout}
                onChange={(patch) => updateElement(selectedElement.id, patch)}
              />
            ) : (
              <div className="flex flex-col items-center justify-center h-full text-ink-600/60 text-sm text-center">
                <FileText size={32} className="mb-2 opacity-40" />
                Select an element to edit its properties
              </div>
            )}
          </div>
        </div>
      ) : tab === 'instructions' ? (
        <div className="flex-1 bg-white rounded-xl2 shadow-soft p-6 overflow-y-auto">
          <div className="flex items-start justify-between gap-6 mb-6">
            <div>
              <h2 className="font-display text-xl font-semibold mb-1">Instructions</h2>
              <p className="text-sm text-ink-600">
                Define the context and guidelines sent to the AI during generation.
                Each section accepts a PDF, .txt or .md file.
              </p>
            </div>
            <InstructionBudgetGauge
              texts={[absoluteRules, randomizationInstructions, carouselInstructions, avatarInstructions, styleGuide, geminiInstructions]}
            />
          </div>
          <div className="space-y-8">
            <InstructionSection
              title="Mandatory rules"
              subtitle="Rules the AI can never violate. Highest priority, right after the master instructions in settings."
              value={absoluteRules}
              onChange={setAbsoluteRules}
            />
            <InstructionSection
              title="Randomization"
              subtitle={`Random choices injected on each generation. Syntax: [[option A | option B (40%) | option C]]. Controls carousel type, background color, image details, etc.`}
              value={randomizationInstructions}
              onChange={setRandomizationInstructions}
            />
            <InstructionSection
              title="General instructions"
              subtitle="Structure guidelines, slide count, generation constraints."
              value={carouselInstructions}
              onChange={setCarouselInstructions}
            />
            <InstructionSection
              title="Avatar"
              subtitle="Persona profile: voice, tone, values, story."
              value={avatarInstructions}
              onChange={setAvatarInstructions}
            />
            <InstructionSection
              title="Writing style"
              subtitle="Style rules, punctuation, language register."
              value={styleGuide}
              onChange={setStyleGuide}
            />
            <InstructionSection
              title="Artistic style"
              subtitle="Visual directives for AI-generated images."
              value={geminiInstructions}
              onChange={setGeminiInstructions}
            />
          </div>
        </div>
      ) : tab === 'references' ? (
        <div className="flex-1 bg-white rounded-xl2 shadow-soft p-6 overflow-y-auto">
          <ReferencesPanel templateId={initialTemplate.id} />
        </div>
      ) : tab === 'pages' ? (
        <div className="flex-1 bg-white rounded-xl2 shadow-soft p-6 overflow-y-auto">
          <PagesTab
            templateId={initialTemplate.id}
            userId={userId}
            anthropicApiKey={anthropicApiKey}
          />
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-xl2 shadow-soft p-6 overflow-y-auto">
          <BackgroundsTab
            templateId={initialTemplate.id}
            userId={userId}
            mode={layout.backgroundsMode ?? 'all'}
            onModeChange={(mode) => pushLayout((l) => ({ ...l, backgroundsMode: mode }))}
          />
        </div>
      )}
    </div>
  )
}

function normalizeLayout(raw: TemplateLayout): TemplateLayout {
  const slideTypes = raw.slideTypes && raw.slideTypes.length > 0
    ? raw.slideTypes
    : ['title', 'content', 'cta']
  const elements: TemplateElement[] = (raw.elements || []).map((el) => {
    const anyEl = el as unknown as { slideType?: string; slideTypes?: string[]; field?: string; role?: TextRole }
    const slideType =
      anyEl.slideType ||
      (anyEl.slideTypes && anyEl.slideTypes[0]) ||
      slideTypes[0]
    const next = { ...el, slideType } as TemplateElement
    if (next.type === 'text') {
      const t = next as TextElement
      if (!t.role) {
        // Infer role from the legacy `field` string
        const field = anyEl.field || ''
        t.role =
          field.includes('heading') || field === 'title_text'
            ? 'title'
            : field.includes('sub')
            ? 'subtitle'
            : 'text'
      }
      if (!t.bgMode) t.bgMode = 'block'
    }
    return next
  })
  return {
    ...raw,
    slideTypes,
    elements,
    padding: raw.padding || { top: 0, right: 0, bottom: 0, left: 0 },
  }
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

function SlideTypeTab({
  type,
  active,
  renaming,
  renameValue,
  canDelete,
  onSelect,
  onStartRename,
  onChangeRename,
  onCommitRename,
  onCancelRename,
  onDelete,
  onDuplicate,
}: {
  type: string
  active: boolean
  renaming: boolean
  renameValue: string
  canDelete: boolean
  onSelect: () => void
  onStartRename: () => void
  onChangeRename: (v: string) => void
  onCommitRename: () => void
  onCancelRename: () => void
  onDelete: () => void
  onDuplicate: () => void
}) {
  if (renaming) {
    return (
      <div className="flex items-center gap-1 bg-white rounded-full pl-3 pr-1 py-1 shadow-soft">
        <input
          value={renameValue}
          onChange={(e) => onChangeRename(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter') onCommitRename()
            if (e.key === 'Escape') onCancelRename()
          }}
          autoFocus
          className="text-xs bg-transparent outline-none w-20"
        />
        <button
          onClick={onCommitRename}
          className="p-1 rounded-full hover:bg-pastel-mint"
          title="OK"
        >
          <Check size={12} />
        </button>
        <button
          onClick={onCancelRename}
          className="p-1 rounded-full hover:bg-cream-200"
          title="Cancel"
        >
          <X size={12} />
        </button>
      </div>
    )
  }
  return (
    <div
      className={`flex items-center rounded-full text-xs transition overflow-hidden ${
        active ? 'bg-ink-900 text-white' : 'bg-white text-ink-700 shadow-soft'
      }`}
    >
      <button onClick={onSelect} className="pl-3 pr-1.5 py-1">
        {type}
      </button>
      <button
        onClick={onStartRename}
        className={`px-1.5 py-1 ${active ? 'hover:bg-ink-800' : 'hover:bg-cream-100'}`}
        title="Rename"
      >
        <Pencil size={10} />
      </button>
      <button
        onClick={onDuplicate}
        className={`px-1.5 py-1 ${active ? 'hover:bg-ink-800' : 'hover:bg-cream-100'}`}
        title="Duplicate this slide type"
      >
        <Copy size={10} />
      </button>
      {canDelete && (
        <button
          onClick={onDelete}
          className={`px-2 py-1 ${active ? 'hover:bg-red-600' : 'hover:bg-red-50 hover:text-red-600'}`}
          title="Supprimer"
        >
          <X size={12} />
        </button>
      )}
    </div>
  )
}

function LayerItem({
  element,
  selected,
  onSelect,
  onRemove,
  onMoveUp,
  onMoveDown,
  onToggleLock,
}: {
  element: TemplateElement
  selected: boolean
  onSelect: () => void
  onRemove: () => void
  onMoveUp: () => void
  onMoveDown: () => void
  onToggleLock: () => void
}) {
  const Icon = element.type === 'text' ? Type : element.type === 'image' ? ImageIcon : Square
  const label =
    element.type === 'text'
      ? roleLabel((element as TextElement).role)
      : element.type === 'image'
      ? 'Image'
      : 'Shape'

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
          onToggleLock()
        }}
        className="p-0.5 hover:bg-white/50 rounded"
        title={element.locked ? 'Unlock' : 'Lock'}
      >
        {element.locked ? (
          <LockIcon size={12} className="text-ink-900" />
        ) : (
          <UnlockIcon size={12} className="text-ink-600/60" />
        )}
      </button>
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

function roleLabel(role: TextRole): string {
  switch (role) {
    case 'title':
      return 'Title'
    case 'subtitle':
      return 'Subtitle'
    case 'text':
      return 'Text'
    default:
      return role
  }
}

function PropertiesPanel({
  element,
  layout,
  onChange,
}: {
  element: TemplateElement
  layout: TemplateLayout
  onChange: (patch: Partial<TemplateElement>) => void
}) {
  const CW = layout.width
  const CH = layout.height
  const w = element.width
  const h = element.height

  const alignH = (x: number) => onChange({ x: Math.round(x) })
  const alignV = (y: number) => onChange({ y: Math.round(y) })

  const btnBase = 'flex-1 flex items-center justify-center p-1.5 rounded-lg border border-ink-200 hover:bg-cream-100 transition'

  const ASPECT_RATIOS = [
    { label: '1:1', value: '1:1' },
    { label: '16:9', value: '16:9' },
    { label: '9:16', value: '9:16' },
    { label: '3:2', value: '3:2' },
    { label: '4:3', value: '4:3' },
  ]

  return (
    <div className="space-y-3 text-xs">
      <div className="text-[10px] uppercase tracking-wide text-ink-600 font-medium">
        {element.type}
      </div>

      {element.type === 'image' ? (
        <div>
          <div className="text-[10px] text-ink-600 uppercase tracking-wide mb-1.5">Aspect ratio</div>
          <div className="flex flex-wrap gap-1">
            {ASPECT_RATIOS.map(({ label, value }) => {
              const [wPart, hPart] = value.split(':').map(Number)
              const isActive = (element as ImageElement).aspectRatio === value
              return (
                <button
                  key={value}
                  onClick={() => {
                    const newHeight = Math.round(element.width * hPart / wPart)
                    onChange({ aspectRatio: value, height: newHeight } as Partial<ImageElement>)
                  }}
                  className={`px-2.5 py-1 rounded-full text-[10px] transition ${
                    isActive ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'
                  }`}
                >
                  {label}
                </button>
              )
            })}
          </div>
        </div>
      ) : (
        <div className="grid grid-cols-2 gap-2">
          <NumberField label="X" value={element.x} onChange={(v) => onChange({ x: v })} />
          <NumberField label="Y" value={element.y} onChange={(v) => onChange({ y: v })} />
          <NumberField label="W" value={element.width} onChange={(v) => onChange({ width: v })} />
          <NumberField label="H" value={element.height} onChange={(v) => onChange({ height: v })} />
        </div>
      )}

      {/* Alignment buttons */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-ink-600 uppercase tracking-wide">Alignment</div>
        <div className="flex gap-1">
          <button className={btnBase} title="Align left" onClick={() => alignH(0)}>
            <AlignStartVertical size={12} />
          </button>
          <button className={btnBase} title="Center horizontally" onClick={() => alignH((CW - w) / 2)}>
            <AlignCenterVertical size={12} />
          </button>
          <button className={btnBase} title="Align right" onClick={() => alignH(CW - w)}>
            <AlignEndVertical size={12} />
          </button>
        </div>
        <div className="flex gap-1">
          <button className={btnBase} title="Align top" onClick={() => alignV(0)}>
            <AlignStartHorizontal size={12} />
          </button>
          <button className={btnBase} title="Center vertically" onClick={() => alignV((CH - h) / 2)}>
            <AlignCenterHorizontal size={12} />
          </button>
          <button className={btnBase} title="Align bottom" onClick={() => alignV(CH - h)}>
            <AlignEndHorizontal size={12} />
          </button>
        </div>
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

function PaddingField({
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
        min={0}
        className="input text-xs py-1.5"
        value={value}
        onChange={(e) => onChange(Math.max(0, parseInt(e.target.value) || 0))}
      />
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
  const [selIdx, setSelIdx] = useState(0)
  const [dragIdx, setDragIdx] = useState<number | null>(null)
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null)

  useEffect(() => { setSelIdx(0) }, [element.id])

  const paragraphs: TextParagraph[] =
    element.paragraphs && element.paragraphs.length > 0
      ? element.paragraphs
      : [{ role: element.role }]

  const clampedIdx = Math.min(selIdx, paragraphs.length - 1)
  const sel = paragraphs[clampedIdx]

  const updatePara = (patch: Partial<TextParagraph>) => {
    const next = paragraphs.map((p, i) => (i === clampedIdx ? { ...p, ...patch } : p))
    onChange({ paragraphs: next })
  }

  const addPara = () => {
    const newRole = 'text' as TextRole
    const next = [...paragraphs, { role: newRole, fontFamily: element.fontFamily, ...roleDefaults(newRole, element.fontSize) }]
    onChange({ paragraphs: next })
    setSelIdx(next.length - 1)
  }

  const addSeparator = () => {
    const next = [...paragraphs, { separatorHeight: 20 }]
    onChange({ paragraphs: next })
    setSelIdx(next.length - 1)
  }

  const removePara = (i: number) => {
    if (paragraphs.length <= 1) return
    const next = paragraphs.filter((_, idx) => idx !== i)
    onChange({ paragraphs: next })
    setSelIdx(Math.min(clampedIdx, next.length - 1))
  }

  const reorderPara = (from: number, to: number) => {
    if (from === to) return
    const next = [...paragraphs]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    onChange({ paragraphs: next })
    setSelIdx(to)
  }

  const paraRoleLabel = (p: TextParagraph) => {
    if (p.separatorHeight) return `── ${p.separatorHeight}px ──`
    return ROLE_OPTIONS.find((r) => r.value === (p.role ?? element.role))?.label ?? '—'
  }

  const effFontSize = sel.fontSize ?? element.fontSize
  const effWeight = String(sel.fontWeight ?? element.fontWeight ?? 400)
  const effColor = sel.color ?? element.color
  const effAlign = sel.align ?? element.align ?? 'left'

  return (
    <>
      {/* ── Paramètres globaux du bloc ──────────────────────── */}
      <div className="grid grid-cols-2 gap-2">
        <ColorField
          label="Fond"
          value={element.backgroundColor || ''}
          onChange={(v) => onChange({ backgroundColor: v || undefined })}
        />
        <NumberField
          label="Padding fond"
          value={element.padding ?? 0}
          onChange={(v) => onChange({ padding: Math.max(0, v) })}
        />
      </div>
      <div>
        <label className="block text-[10px] text-ink-600 mb-0.5">Mode fond</label>
        <div className="flex gap-1">
          {(['block', 'inline'] as const).map((m) => (
            <button
              key={m}
              onClick={() => onChange({ bgMode: m })}
              className={`flex-1 py-1.5 rounded-lg text-[10px] ${
                (element.bgMode || 'block') === m ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
              }`}
              title={m === 'block' ? 'Fond sur tout le bloc' : 'Fond ajusté au texte'}
            >
              {m}
            </button>
          ))}
        </div>
      </div>

      <div>
        <label className="block text-[10px] text-ink-600 mb-0.5">Ancre (étirement)</label>
        <div className="flex gap-1">
          {([
            { value: 'down', label: '↓ bas', title: 'Le bord haut est fixe — la box grandit vers le bas' },
            { value: 'both', label: '↕ centre', title: 'Le centre est fixe — la box grandit des deux côtés' },
            { value: 'up',   label: '↑ haut', title: 'Le bord bas est fixe — la box grandit vers le haut' },
          ] as const).map(({ value, label, title }) => (
            <button
              key={value}
              onClick={() => onChange({ growDirection: value })}
              className={`flex-1 py-1.5 rounded-lg text-[10px] ${
                (element.growDirection ?? 'both') === value ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
              }`}
              title={title}
            >
              {label}
            </button>
          ))}
        </div>
      </div>

      {/* ── Liste des placeholders ────────────────────────── */}
      <div>
        <div className="flex items-center justify-between mb-1">
          <span className="text-[10px] uppercase tracking-wide text-ink-600 font-medium">Placeholders</span>
          <div className="flex gap-1">
            <button
              onClick={addPara}
              className="text-[10px] px-2 py-0.5 rounded bg-cream-100 hover:bg-cream-200 text-ink-700"
            >
              + Texte
            </button>
            <button
              onClick={addSeparator}
              className="text-[10px] px-2 py-0.5 rounded bg-cream-100 hover:bg-cream-200 text-ink-700"
              title="Ajouter un espace vide entre deux placeholders"
            >
              + Espace
            </button>
          </div>
        </div>
        <div className="flex flex-col gap-1">
          {paragraphs.map((p, i) => (
            <div
              key={i}
              draggable
              onClick={() => setSelIdx(i)}
              onDragStart={(e) => { e.dataTransfer.effectAllowed = 'move'; setDragIdx(i) }}
              onDragOver={(e) => { e.preventDefault(); e.dataTransfer.dropEffect = 'move'; setDragOverIdx(i) }}
              onDragLeave={() => setDragOverIdx(null)}
              onDrop={(e) => { e.preventDefault(); if (dragIdx !== null) reorderPara(dragIdx, i); setDragIdx(null); setDragOverIdx(null) }}
              onDragEnd={() => { setDragIdx(null); setDragOverIdx(null) }}
              className={`flex items-center justify-between px-2 py-1.5 rounded-lg cursor-grab active:cursor-grabbing transition-opacity ${
                clampedIdx === i
                  ? 'bg-ink-900 text-white'
                  : 'bg-cream-100 text-ink-700 hover:bg-cream-200'
              } ${
                dragIdx === i ? 'opacity-40' : ''
              } ${
                dragOverIdx === i && dragIdx !== i ? 'ring-2 ring-ink-400 ring-inset' : ''
              }`}
            >
              <span className="text-[10px] truncate flex-1 mr-1">{paraRoleLabel(p)}</span>
              {paragraphs.length > 1 && (
                <button
                  onClick={(e) => { e.stopPropagation(); removePara(i) }}
                  className={`text-xs shrink-0 ${
                    clampedIdx === i ? 'text-white/60 hover:text-white' : 'text-ink-400 hover:text-red-500'
                  }`}
                >
                  ×
                </button>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* ── Édition du placeholder sélectionné ───────────────── */}
      <div className="border-t border-ink-100 pt-3 space-y-2">
        <div className="text-[10px] uppercase tracking-wide text-ink-600 font-medium">
          Placeholder {clampedIdx + 1} / {paragraphs.length}
        </div>

        {/* Separator editor */}
        {sel.separatorHeight !== undefined ? (
          <NumberField
            label="Hauteur (px)"
            value={sel.separatorHeight}
            onChange={(v) => updatePara({ separatorHeight: Math.max(0, Math.round(v)) })}
          />
        ) : (<>

        <div>
          <label className="block text-[10px] text-ink-600 mb-0.5">Rôle</label>
          <select
            className="input text-xs py-1.5"
            value={sel.role ?? element.role}
            onChange={(e) => updatePara({ role: e.target.value as TextRole })}
          >
            {ROLE_OPTIONS.map((r) => (
              <option key={r.value} value={r.value}>{r.label}</option>
            ))}
          </select>
        </div>
        <div className="border border-cream-200 rounded-lg p-2 space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={sel.highlight ?? false}
              onChange={(e) => updatePara({ highlight: e.target.checked })}
              className="w-3 h-3 accent-ink-900"
            />
            <span className="text-[10px] text-ink-700 font-medium">Surligner (IA choisit les mots)</span>
          </label>
          {sel.highlight && (
            <ColorField
              label="Couleur du surlignement"
              value={sel.highlightColor ?? '#FFE500'}
              onChange={(v) => updatePara({ highlightColor: v })}
            />
          )}
        </div>
        <div className="border border-cream-200 rounded-lg p-2 space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!sel.shadow}
              onChange={(e) =>
                updatePara({
                  shadow: e.target.checked
                    ? (sel.shadow ?? { color: '#000000', offsetX: 0, offsetY: 4, blur: 8, opacity: 0.35 })
                    : undefined,
                })
              }
              className="w-3 h-3 accent-ink-900"
            />
            <span className="text-[10px] text-ink-700 font-medium">Ombre portée</span>
          </label>
          {sel.shadow && (
            <>
              <ColorField
                label="Couleur"
                value={sel.shadow.color}
                onChange={(v) => updatePara({ shadow: { ...sel.shadow!, color: v } })}
              />
              <div className="grid grid-cols-2 gap-2">
                <NumberField
                  label="Décal. X"
                  value={sel.shadow.offsetX}
                  onChange={(v) => updatePara({ shadow: { ...sel.shadow!, offsetX: Math.round(v) } })}
                />
                <NumberField
                  label="Décal. Y"
                  value={sel.shadow.offsetY}
                  onChange={(v) => updatePara({ shadow: { ...sel.shadow!, offsetY: Math.round(v) } })}
                />
                <NumberField
                  label="Flou"
                  value={sel.shadow.blur}
                  onChange={(v) => updatePara({ shadow: { ...sel.shadow!, blur: Math.max(0, Math.round(v)) } })}
                />
                <NumberField
                  label="Opacité %"
                  value={Math.round(sel.shadow.opacity * 100)}
                  onChange={(v) =>
                    updatePara({
                      shadow: { ...sel.shadow!, opacity: Math.max(0, Math.min(1, v / 100)) },
                    })
                  }
                />
              </div>
            </>
          )}
        </div>
        <div className="border border-cream-200 rounded-lg p-2 space-y-1.5">
          <label className="flex items-center gap-2 cursor-pointer select-none">
            <input
              type="checkbox"
              checked={!!sel.strokeColor}
              onChange={(e) =>
                updatePara({
                  strokeColor: e.target.checked ? (sel.strokeColor ?? '#ffffff') : undefined,
                  strokeWidth: e.target.checked ? (sel.strokeWidth ?? 2) : undefined,
                })
              }
              className="w-3 h-3 accent-ink-900"
            />
            <span className="text-[10px] text-ink-700 font-medium">Bordure</span>
          </label>
          {sel.strokeColor && (
            <div className="grid grid-cols-2 gap-2">
              <ColorField
                label="Couleur"
                value={sel.strokeColor}
                onChange={(v) => updatePara({ strokeColor: v })}
              />
              <NumberField
                label="Épaisseur"
                value={sel.strokeWidth ?? 2}
                onChange={(v) => updatePara({ strokeWidth: Math.max(0.5, v) })}
              />
            </div>
          )}
        </div>
        <div>
          <label className="block text-[10px] text-ink-600 mb-0.5">Police</label>
          <FontPicker
            value={sel.fontFamily ?? element.fontFamily}
            onChange={(v) => updatePara({ fontFamily: v })}
          />
        </div>
        <div className="grid grid-cols-2 gap-2">
          <NumberField
            label="Taille"
            value={effFontSize}
            onChange={(v) => updatePara({ fontSize: v })}
          />
          <div>
            <label className="block text-[10px] text-ink-600 mb-0.5">Poids</label>
            <select
              className="input text-xs py-1.5"
              value={effWeight}
              onChange={(e) => updatePara({ fontWeight: parseInt(e.target.value) })}
            >
              <option value="400">Regular</option>
              <option value="500">Medium</option>
              <option value="600">Semi-bold</option>
              <option value="700">Bold</option>
            </select>
          </div>
        </div>
        <ColorField
          label="Couleur"
          value={effColor}
          onChange={(v) => updatePara({ color: v })}
        />
        <div>
          <label className="block text-[10px] text-ink-600 mb-0.5">Alignement</label>
          <div className="flex gap-1">
            {(['left', 'center', 'right'] as const).map((a) => (
              <button
                key={a}
                onClick={() => updatePara({ align: a })}
                className={`flex-1 py-1.5 rounded-lg text-[10px] ${
                  effAlign === a ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
                }`}
              >
                {a}
              </button>
            ))}
          </div>
        </div>
        </>)}
      </div>

      {/* ── Alignement vertical du bloc texte dans la box ───────────── */}
      <div className="border-t border-ink-100 pt-3">
        <label className="block text-[10px] text-ink-600 mb-0.5">Alignement vertical</label>
        <div className="flex gap-1">
          {([
            { value: 'top',    label: '↑ Haut',   title: 'Texte aligné en haut de la box' },
            { value: 'middle', label: '↕ Centre', title: 'Texte centré verticalement dans la box' },
            { value: 'bottom', label: '↓ Bas',    title: 'Texte aligné en bas de la box' },
          ] as const).map(({ value, label, title }) => (
            <button
              key={value}
              onClick={() => onChange({ verticalAlign: value })}
              className={`flex-1 py-1.5 rounded-lg text-[10px] ${
                element.verticalAlign === value ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
              }`}
              title={title}
            >
              {label}
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
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append('file', file)
      const res = await fetch('/api/upload-asset', { method: 'POST', body: fd })
      if (!res.ok) throw new Error('Upload failed')
      const { url } = await res.json()
      onChange({ source: 'asset', assetUrl: url })
    } catch {
      alert('Upload error.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

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
            AI
          </button>
          <button
            onClick={() => onChange({ source: 'asset' })}
            className={`flex-1 py-1.5 rounded-lg text-[10px] ${
              element.source === 'asset' ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
            }`}
          >
            Fixed URL
          </button>
          <button
            onClick={() => onChange({ source: 'pages' })}
            className={`flex-1 py-1.5 rounded-lg text-[10px] ${
              element.source === 'pages' ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
            }`}
          >
            Pages
          </button>
          <button
            onClick={() => onChange({ source: 'backgrounds' })}
            className={`flex-1 py-1.5 rounded-lg text-[10px] ${
              element.source === 'backgrounds' ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700'
            }`}
          >
            Backgrounds
          </button>
        </div>
      </div>
      {element.source === 'asset' && (
        <>
          <TextField
            label="Image URL"
            value={element.assetUrl || ''}
            onChange={(v) => onChange({ assetUrl: v })}
            placeholder="https://..."
          />
          <button
            onClick={() => fileRef.current?.click()}
            disabled={uploading}
            className="w-full py-1.5 rounded-lg border border-ink-200 hover:bg-cream-100 text-[10px] text-ink-700 flex items-center justify-center gap-1.5 disabled:opacity-50"
          >
            <Upload size={11} />
            {uploading ? 'Uploading…' : 'Import image'}
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="image/*"
            className="hidden"
            onChange={handleFile}
          />
        </>
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
        label="Fill"
        value={element.fill}
        onChange={(v) => onChange({ fill: v })}
      />
      <div className="grid grid-cols-2 gap-2">
        <NumberField
          label="Corner radius"
          value={element.cornerRadius || 0}
          onChange={(v) => onChange({ cornerRadius: Math.max(0, v) })}
        />
        <NumberField
          label="Opacity (%)"
          value={Math.round((element.opacity ?? 1) * 100)}
          onChange={(v) => onChange({ opacity: Math.max(0, Math.min(100, v)) / 100 })}
        />
      </div>
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

function InstructionSection({
  title,
  subtitle,
  value,
  onChange,
}: {
  title: string
  subtitle: string
  value: string
  onChange: (v: string) => void
}) {
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)

  async function handleFile(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
      if (ext === 'md' || ext === 'txt') {
        const text = await file.text()
        onChange(text)
      } else if (ext === 'pdf') {
        const fd = new FormData()
        fd.append('file', file)
        const res = await fetch('/api/parse-document', { method: 'POST', body: fd })
        if (!res.ok) throw new Error('Parse failed')
        const { text } = await res.json()
        onChange(text)
      }
    } catch {
      alert('Erreur lors de la lecture du fichier.')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="space-y-2 pb-8 border-b border-cream-100 last:border-0 last:pb-0">
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="font-semibold text-sm text-ink-900">{title}</h3>
          <p className="text-xs text-ink-600 mt-0.5">{subtitle}</p>
        </div>
        <button
          onClick={() => fileRef.current?.click()}
          disabled={uploading}
          className="shrink-0 text-[11px] px-2.5 py-1.5 rounded-lg border border-ink-200 hover:bg-cream-100 text-ink-700 flex items-center gap-1.5 disabled:opacity-50"
        >
          <Upload size={11} />
          {uploading ? 'Reading…' : 'Import'}
        </button>
        <input
          ref={fileRef}
          type="file"
          accept=".pdf,.txt,.md"
          className="hidden"
          onChange={handleFile}
        />
      </div>
      <textarea
        className="textarea min-h-[160px] font-mono text-xs"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder="Empty — write or import a PDF, .txt or .md file…"
      />
    </div>
  )
}
