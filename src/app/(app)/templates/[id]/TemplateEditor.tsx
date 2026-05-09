'use client'

import { useEffect, useRef, useState, useCallback, useMemo } from 'react'
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
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { FontPicker } from '@/components/FontPicker'
import { ReferencesPanel } from '@/components/TemplateBuilder/ReferencesPanel'
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

type Tab = 'design' | 'instructions' | 'references'

const HISTORY_LIMIT = 10

function roleDefaults(role: TextRole, baseSize: number): Pick<TextParagraph, 'fontSize' | 'fontWeight'> {
  const sz: Record<TextRole, number> = { title: baseSize, subtitle: Math.round(baseSize * 0.65), text: Math.round(baseSize * 0.45) }
  const fw: Record<TextRole, number> = { title: 700, subtitle: 600, text: 400 }
  return { fontSize: sz[role], fontWeight: fw[role] }
}

const ROLE_OPTIONS: { value: TextRole; label: string }[] = [
  { value: 'title', label: 'Titre' },
  { value: 'subtitle', label: 'Sous-titre' },
  { value: 'text', label: 'Texte' },
]

export function TemplateEditor({ initialTemplate }: { initialTemplate: InitialTemplate }) {
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

  // Push a new layout state onto the history stack (capped at HISTORY_LIMIT)
  const pushLayout = useCallback(
    (next: TemplateLayout | ((prev: TemplateLayout) => TemplateLayout)) => {
      setHistory((hist) => {
        const base = hist[historyIndex]
        const nextLayout = typeof next === 'function' ? next(base) : next
        const truncated = hist.slice(0, historyIndex + 1)
        const pushed = [...truncated, nextLayout]
        const overflow = pushed.length - HISTORY_LIMIT
        if (overflow > 0) pushed.splice(0, overflow)
        setHistoryIndex(pushed.length - 1)
        return pushed
      })
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
        fill: '#f1b5c6',
        cornerRadius: 12,
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
      return { ...l, elements: newEls }
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
        `Supprimer le type "${st}" ? Tous les éléments rattachés à ce type seront supprimés.`
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
      alert('Ce nom existe déjà')
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
      alert('Erreur : ' + error.message)
    }
  }

  async function handleDelete() {
    if (!confirm(`Supprimer le template "${name}" ?`)) return
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
            title="Annuler (Cmd+Z)"
          >
            <Undo2 size={15} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            className="p-2.5 rounded-full bg-white shadow-soft hover:shadow-card disabled:opacity-40 disabled:cursor-not-allowed"
            title="Rétablir (Cmd+Shift+Z)"
          >
            <Redo2 size={15} />
          </button>
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
            {saving ? '...' : 'Enregistrer'}
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
          Références visuelles
        </TabButton>
      </div>

      {tab === 'design' ? (
        <div className="flex-1 flex gap-4 min-h-0">
          {/* Left: layers panel + padding */}
          <div className="w-60 bg-white rounded-xl2 shadow-soft p-3 flex flex-col gap-3 overflow-y-auto">
            <div>
              <div className="flex items-center justify-between px-2 py-1 mb-1">
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
                    Aucun élément sur ce type de slide
                  </div>
                )}
              </div>
            </div>

            {/* Padding / safe area */}
            <div className="border-t border-cream-100 pt-3">
              <div className="text-xs font-medium uppercase tracking-wide text-ink-600 px-2 mb-2">
                Espace intérieur
              </div>
              <div className="grid grid-cols-2 gap-2 px-1">
                <PaddingField
                  label="Haut"
                  value={layout.padding?.top || 0}
                  onChange={(v) => updatePadding('top', v)}
                />
                <PaddingField
                  label="Droite"
                  value={layout.padding?.right || 0}
                  onChange={(v) => updatePadding('right', v)}
                />
                <PaddingField
                  label="Bas"
                  value={layout.padding?.bottom || 0}
                  onChange={(v) => updatePadding('bottom', v)}
                />
                <PaddingField
                  label="Gauche"
                  value={layout.padding?.left || 0}
                  onChange={(v) => updatePadding('left', v)}
                />
              </div>
              <p className="text-[10px] text-ink-600/60 px-2 mt-2">
                Guides violets sur le canvas
              </p>
            </div>
          </div>

          {/* Center: canvas */}
          <div className="flex-1 flex flex-col gap-3 min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="text-xs text-ink-600">Slide :</span>
              {layout.slideTypes.map((st) => (
                <SlideTypeTab
                  key={st}
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
              ))}
              <button
                onClick={addSlideType}
                className="w-7 h-7 rounded-full bg-white hover:bg-cream-100 shadow-soft flex items-center justify-center"
                title="Ajouter un type de slide"
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
                title={snapEnabled ? 'Désactiver l\'aimant' : 'Activer l\'aimant (snap)'}
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
                title={showGuides ? 'Masquer les guides' : 'Afficher les guides'}
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
                Sélectionnez un élément pour modifier ses propriétés
              </div>
            )}
          </div>
        </div>
      ) : tab === 'instructions' ? (
        <div className="flex-1 bg-white rounded-xl2 shadow-soft p-6 overflow-y-auto">
          <h2 className="font-display text-xl font-semibold mb-1">Instructions</h2>
          <p className="text-sm text-ink-600 mb-6">
            Définissez le contexte et les consignes transmis à l&apos;IA lors de la génération.
            Chaque section accepte un fichier PDF, .txt ou .md.
          </p>
          <div className="space-y-8">
            <InstructionSection
              title="Règles impératives"
              subtitle="Règles que l'IA ne peut jamais violer. Priorité maximale, juste après les instructions master du dashboard."
              value={absoluteRules}
              onChange={setAbsoluteRules}
            />
            <InstructionSection
              title="Randomisation"
              subtitle={`Choix aléatoires injectés à chaque génération. Syntaxe : [[option A | option B (40%) | option C]]. Contrôle le type de carrousel, la couleur de fond, les détails des images, etc.`}
              value={randomizationInstructions}
              onChange={setRandomizationInstructions}
            />
            <InstructionSection
              title="Instructions générales"
              subtitle="Consignes de structure, nombre de slides, contraintes de génération."
              value={carouselInstructions}
              onChange={setCarouselInstructions}
            />
            <InstructionSection
              title="Avatar"
              subtitle="Profil du persona : voix, ton, valeurs, histoire."
              value={avatarInstructions}
              onChange={setAvatarInstructions}
            />
            <InstructionSection
              title="Style d&apos;écriture"
              subtitle="Règles de style, ponctuation, registre de langue."
              value={styleGuide}
              onChange={setStyleGuide}
            />
            <InstructionSection
              title="Style artistique"
              subtitle="Directives visuelles pour les images générées par Gemini."
              value={geminiInstructions}
              onChange={setGeminiInstructions}
            />
          </div>
        </div>
      ) : (
        <div className="flex-1 bg-white rounded-xl2 shadow-soft p-6 overflow-y-auto">
          <ReferencesPanel templateId={initialTemplate.id} />
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
          title="Annuler"
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
        title="Renommer"
      >
        <Pencil size={10} />
      </button>
      <button
        onClick={onDuplicate}
        className={`px-1.5 py-1 ${active ? 'hover:bg-ink-800' : 'hover:bg-cream-100'}`}
        title="Dupliquer ce slide type"
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
          onToggleLock()
        }}
        className="p-0.5 hover:bg-white/50 rounded"
        title={element.locked ? 'Déverrouiller' : 'Verrouiller'}
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
      return 'Titre'
    case 'subtitle':
      return 'Sous-titre'
    case 'text':
      return 'Texte'
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

  return (
    <div className="space-y-3 text-xs">
      <div className="text-[10px] uppercase tracking-wide text-ink-600 font-medium">
        {element.type}
      </div>

      <div className="grid grid-cols-2 gap-2">
        <NumberField label="X" value={element.x} onChange={(v) => onChange({ x: v })} />
        <NumberField label="Y" value={element.y} onChange={(v) => onChange({ y: v })} />
        <NumberField label="W" value={element.width} onChange={(v) => onChange({ width: v })} />
        <NumberField label="H" value={element.height} onChange={(v) => onChange({ height: v })} />
      </div>

      {/* Alignment buttons */}
      <div className="space-y-1.5">
        <div className="text-[10px] text-ink-600 uppercase tracking-wide">Alignement</div>
        <div className="flex gap-1">
          <button className={btnBase} title="Aligner à gauche" onClick={() => alignH(0)}>
            <AlignStartVertical size={12} />
          </button>
          <button className={btnBase} title="Centrer horizontalement" onClick={() => alignH((CW - w) / 2)}>
            <AlignCenterVertical size={12} />
          </button>
          <button className={btnBase} title="Aligner à droite" onClick={() => alignH(CW - w)}>
            <AlignEndVertical size={12} />
          </button>
        </div>
        <div className="flex gap-1">
          <button className={btnBase} title="Aligner en haut" onClick={() => alignV(0)}>
            <AlignStartHorizontal size={12} />
          </button>
          <button className={btnBase} title="Centrer verticalement" onClick={() => alignV((CH - h) / 2)}>
            <AlignCenterHorizontal size={12} />
          </button>
          <button className={btnBase} title="Aligner en bas" onClick={() => alignV(CH - h)}>
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

  const paraRoleLabel = (p: TextParagraph) =>
    ROLE_OPTIONS.find((r) => r.value === (p.role ?? element.role))?.label ?? '—'

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
          <button
            onClick={addPara}
            className="text-[10px] px-2 py-0.5 rounded bg-cream-100 hover:bg-cream-200 text-ink-700"
          >
            + Ajouter
          </button>
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
      alert('Erreur lors de l\'upload.')
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
        <>
          <TextField
            label="URL de l'image"
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
            {uploading ? 'Upload…' : 'Importer une image'}
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
          {uploading ? 'Lecture…' : 'Importer'}
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
        placeholder="Vide — écrire ou importer un fichier PDF, .txt ou .md…"
      />
    </div>
  )
}
