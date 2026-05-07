'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, Loader2, Check, X, ArrowRight, ImageIcon, Layers } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { renderSlideToDataUrl, ensureFontsLoaded } from '@/lib/konva-render'
import type { CarouselSlide, TemplateLayout } from '@/types/database'

type Template = { id: string; name: string; layout: TemplateLayout }
type GlobalStep = { key: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; error?: string }
type CarouselStatus = 'pending' | 'images' | 'rendering' | 'done' | 'error'
type CarouselState = { idx: number; label: string; status: CarouselStatus; error?: string; id?: string }
type Tab = 'creation' | 'processus'

export function GenerateForm({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('creation')
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const [llm, setLlm] = useState<'gemini' | 'claude'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('preferredLlm') as 'gemini' | 'claude') || 'gemini'
    return 'gemini'
  })
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [globalSteps, setGlobalSteps] = useState<GlobalStep[]>([])
  const [carouselStates, setCarouselStates] = useState<CarouselState[]>([])
  const [doneIds, setDoneIds] = useState<string[]>([])
  const doneIdsRef = useRef<string[]>([])

  useEffect(() => {
    const p = searchParams.get('prompt')
    const t = searchParams.get('templateId')
    if (p) setPrompt(p)
    if (t && templates.find(tmpl => tmpl.id === t)) setTemplateId(t)
  }, [searchParams, templates])

  function pushGlobal(step: GlobalStep) { setGlobalSteps(s => [...s, step]) }
  function updateLastGlobal(patch: Partial<GlobalStep>) {
    setGlobalSteps(s => { const c = [...s]; c[c.length - 1] = { ...c[c.length - 1], ...patch }; return c })
  }
  function updateCarousel(idx: number, patch: Partial<CarouselState>) {
    setCarouselStates(s => s.map(c => c.idx === idx ? { ...c, ...patch } : c))
  }

  async function processOneCarousel(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    carousel: any,
    supabase: ReturnType<typeof createClient>,
    userId: string,
    selectedTemplate: Template,
    idx: number,
    runId: string,
  ): Promise<string> {
    const slides: CarouselSlide[] = carousel.slides || []

    // Create DB row
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newRow, error: insertErr } = await (supabase.from('carousels') as any)
      .insert({ user_id: userId, template_id: templateId, prompt, carousel_type: carousel.carousel_type || '', status: 'generating', slides })
      .select('id').single()
    if (insertErr) throw new Error(insertErr.message)
    const carouselId: string = newRow.id

    // Generate both images in PARALLEL
    updateCarousel(idx, { status: 'images' })
    async function fetchImg(imgPrompt: string, slideIndex: number, slideType: 'title' | 'content'): Promise<string> {
      if (!imgPrompt) return ''
      try {
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, carouselId, slideIndex, illustrationPrompt: imgPrompt, slideType, runId }),
        })
        if (!res.ok) { const { error } = await res.json(); throw new Error(error) }
        const { url } = await res.json()
        return url
      } catch { return '' }
    }

    const [titleBg, contentBg] = await Promise.all([
      fetchImg(carousel.image_prompt_title || '', 1, 'title'),
      fetchImg(carousel.image_prompt_content || '', 2, 'content'),
    ])

    const updatedSlides: CarouselSlide[] = slides.map(s => ({
      ...s,
      background_url: s.index === 1 ? (titleBg || undefined) : (contentBg || undefined),
    }))

    // Render + upload slides
    updateCarousel(idx, { status: 'rendering' })
    const renderedSlides: CarouselSlide[] = []
    for (const slide of updatedSlides) {
      try {
        const dataUrl = await renderSlideToDataUrl(selectedTemplate.layout, slide, slide.background_url)
        const uploadRes = await fetch('/api/upload-slide', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ carouselId, slideIndex: slide.index, dataUrl }),
        })
        if (!uploadRes.ok) { const { error } = await uploadRes.json(); throw new Error(error) }
        const { url } = await uploadRes.json()
        renderedSlides.push({ ...slide, rendered_url: url })
      } catch {
        renderedSlides.push(slide)
      }
    }

    // Finalize
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('carousels') as any).update({ status: 'completed', slides: renderedSlides }).eq('id', carouselId)
    updateCarousel(idx, { status: 'done', id: carouselId })

    // Track done IDs
    doneIdsRef.current = [...doneIdsRef.current, carouselId]
    setDoneIds([...doneIdsRef.current])

    return carouselId
  }

  async function handleGenerate() {
    setLoading(true)
    setGlobalSteps([])
    setCarouselStates([])
    setDoneIds([])
    doneIdsRef.current = []
    setTab('processus')

    const supabase = createClient()
    const selectedTemplate = templates.find(t => t.id === templateId)!
    const { data: { user } } = await supabase.auth.getUser()

    try {
      // 1. Generate all texts
      pushGlobal({ key: 'text', label: `Génération des textes (${llm === 'claude' ? 'Claude' : 'Gemini'})`, status: 'running' })
      const textRes = await fetch('/api/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, prompt, llm }),
      })
      if (!textRes.ok) { const { error } = await textRes.json(); throw new Error(error || 'Échec génération texte') }
      const { carousels, runId } = await textRes.json()
      updateLastGlobal({ status: 'done' })

      // 2. Load fonts
      pushGlobal({ key: 'fonts', label: 'Chargement des polices', status: 'running' })
      await ensureFontsLoaded(selectedTemplate.layout)
      updateLastGlobal({ status: 'done' })

      // 3. Init carousel states
      const initial: CarouselState[] = carousels.map((_: unknown, i: number) => ({
        idx: i,
        label: carousels[i].carousel_type || `Carousel ${i + 1}`,
        status: 'pending' as CarouselStatus,
      }))
      setCarouselStates(initial)

      // 4. Process ALL carousels in PARALLEL
      const results = await Promise.allSettled(
        carousels.map((_: unknown, i: number) =>
          processOneCarousel(carousels[i], supabase, user!.id, selectedTemplate, i, runId)
            .catch((err) => {
              updateCarousel(i, { status: 'error', error: err instanceof Error ? err.message : String(err) })
              throw err
            })
        )
      )

      const ids = results
        .filter((r): r is PromiseFulfilledResult<string> => r.status === 'fulfilled')
        .map(r => r.value)

      if (ids.length > 0) {
        setTimeout(() => router.push(`/gallery/${ids[ids.length - 1]}`), 600)
      }
    } catch (err) {
      updateLastGlobal({ status: 'error', error: err instanceof Error ? err.message : String(err) })
    } finally {
      setLoading(false)
    }
  }

  const totalCarousels = carouselStates.length
  const doneCount = carouselStates.filter(c => c.status === 'done').length
  const errorCount = carouselStates.filter(c => c.status === 'error').length

  return (
    <div className="bg-white rounded-xl2 shadow-soft overflow-hidden">
      {/* Tabs */}
      <div className="flex border-b border-cream-100">
        {(['creation', 'processus'] as Tab[]).map(t => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`px-6 py-3 text-sm font-medium capitalize transition border-b-2 -mb-px ${
              tab === t
                ? 'border-ink-900 text-ink-900'
                : 'border-transparent text-ink-600 hover:text-ink-900'
            }`}
          >
            {t === 'creation' ? 'Création' : 'Processus'}
            {t === 'processus' && totalCarousels > 0 && (
              <span className={`ml-2 inline-flex items-center justify-center w-4 h-4 rounded-full text-[10px] ${loading ? 'bg-pastel-lemon' : 'bg-pastel-mint'}`}>
                {loading ? '…' : '✓'}
              </span>
            )}
          </button>
        ))}
      </div>

      {/* Tab: Création */}
      {tab === 'creation' && (
        <div className="p-6 space-y-5">
          <div>
            <label className="block text-xs text-ink-600 mb-2">LLM</label>
            <div className="flex gap-2">
              {(['gemini', 'claude'] as const).map(l => (
                <button key={l} onClick={() => { setLlm(l); localStorage.setItem('preferredLlm', l) }}
                  className={`px-4 py-2 rounded-full text-sm transition ${llm === l ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'}`}>
                  {l === 'gemini' ? 'Gemini' : 'Claude'}
                </button>
              ))}
            </div>
          </div>
          <div>
            <label className="block text-xs text-ink-600 mb-2">Template</label>
            <div className="flex gap-2 flex-wrap">
              {templates.map(t => (
                <button key={t.id} onClick={() => setTemplateId(t.id)}
                  className={`px-4 py-2 rounded-full text-sm transition ${templateId === t.id ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'}`}>
                  {t.name}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-ink-600 mb-2">Idée / instruction (optionnel)</label>
            <textarea
              className="textarea min-h-[100px]"
              placeholder="Ex: un carousel sur le syndrome de l'imposteur chez les femmes TDAH..."
              value={prompt}
              onChange={e => setPrompt(e.target.value)}
              disabled={loading}
            />
          </div>

          <button onClick={handleGenerate} disabled={loading}
            className="inline-flex items-center gap-2 px-5 py-3 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 disabled:opacity-50 shadow-card">
            {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
            {loading ? 'Génération en cours…' : 'Générer'}
          </button>
        </div>
      )}

      {/* Tab: Processus */}
      {tab === 'processus' && (
        <div className="p-6 space-y-4">
          {/* Global steps */}
          {globalSteps.length > 0 && (
            <ul className="space-y-1.5">
              {globalSteps.map((s, idx) => (
                <li key={`${s.key}_${idx}`} className="flex items-center gap-3 text-sm">
                  <StepIcon status={s.status} />
                  <span className={s.status === 'error' ? 'text-red-600' : 'text-ink-700'}>
                    {s.label}
                    {s.error && <span className="text-xs text-red-500 ml-2">— {s.error}</span>}
                  </span>
                </li>
              ))}
            </ul>
          )}

          {/* Per-carousel progress */}
          {carouselStates.length > 0 && (
            <div className="space-y-2">
              {totalCarousels > 1 && (
                <div className="flex items-center justify-between text-xs text-ink-600 mb-1">
                  <span>{totalCarousels} carousels en parallèle</span>
                  <span className="font-medium">{doneCount + errorCount}/{totalCarousels}</span>
                </div>
              )}
              {carouselStates.map(c => (
                <div key={c.idx} className="flex items-center gap-3 py-2 px-3 rounded-xl bg-cream-50">
                  <CarouselIcon status={c.status} />
                  <div className="flex-1 min-w-0">
                    <p className="text-sm text-ink-800 font-medium truncate">{c.label || `Carousel ${c.idx + 1}`}</p>
                    <p className="text-xs text-ink-500">{statusLabel(c.status)}</p>
                  </div>
                  {c.error && <span className="text-xs text-red-500 truncate max-w-[140px]">{c.error}</span>}
                </div>
              ))}
            </div>
          )}

          {globalSteps.length === 0 && carouselStates.length === 0 && (
            <p className="text-sm text-ink-600/60 text-center py-8">Lance une génération pour voir le processus ici.</p>
          )}

          {doneIds.length > 0 && !loading && (
            <div className="mt-2 flex gap-3 flex-wrap">
              {doneIds.map((id, i) => (
                <a key={id} href={`/gallery/${id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900 text-white rounded-full text-sm hover:bg-ink-800 shadow-card">
                  Carousel {doneIds.length > 1 ? i + 1 : ''}
                  <ArrowRight size={13} />
                </a>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

function statusLabel(status: CarouselStatus): string {
  switch (status) {
    case 'pending': return 'En attente…'
    case 'images': return 'Génération des images…'
    case 'rendering': return 'Composition des slides…'
    case 'done': return 'Terminé'
    case 'error': return 'Erreur'
  }
}

function StepIcon({ status }: { status: GlobalStep['status'] }) {
  if (status === 'done') return <div className="w-5 h-5 rounded-full bg-pastel-mint flex items-center justify-center flex-shrink-0"><Check size={12} className="text-ink-900" /></div>
  if (status === 'error') return <div className="w-5 h-5 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0"><X size={12} className="text-red-600" /></div>
  if (status === 'running') return <Loader2 size={16} className="animate-spin text-ink-600 flex-shrink-0" />
  return <div className="w-5 h-5 rounded-full border border-cream-200 flex-shrink-0" />
}

function CarouselIcon({ status }: { status: CarouselStatus }) {
  if (status === 'done') return <div className="w-7 h-7 rounded-full bg-pastel-mint flex items-center justify-center flex-shrink-0"><Check size={13} className="text-ink-900" /></div>
  if (status === 'error') return <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0"><X size={13} className="text-red-600" /></div>
  if (status === 'images') return <div className="w-7 h-7 rounded-full bg-pastel-lemon flex items-center justify-center flex-shrink-0"><ImageIcon size={13} className="text-ink-900 animate-pulse" /></div>
  if (status === 'rendering') return <div className="w-7 h-7 rounded-full bg-pastel-lavender flex items-center justify-center flex-shrink-0"><Layers size={13} className="text-ink-900 animate-pulse" /></div>
  return <div className="w-7 h-7 rounded-full border-2 border-cream-200 flex-shrink-0" />
}
