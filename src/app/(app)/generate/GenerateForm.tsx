'use client'

import { useState, useEffect } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, Loader2, Check, X, ArrowRight } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { renderSlideToDataUrl, ensureFontsLoaded } from '@/lib/konva-render'
import type { CarouselSlide, TemplateLayout } from '@/types/database'

type Template = { id: string; name: string; layout: TemplateLayout }
type Step = { key: string; label: string; status: 'pending' | 'running' | 'done' | 'error'; error?: string }
type Tab = 'creation' | 'processus'

export function GenerateForm({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('creation')
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const [prompt, setPrompt] = useState('')
  const [count, setCount] = useState(1)
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [lastCreatedId, setLastCreatedId] = useState<string | null>(null)
  const [doneIds, setDoneIds] = useState<string[]>([])

  useEffect(() => {
    const p = searchParams.get('prompt')
    const t = searchParams.get('templateId')
    if (p) setPrompt(p)
    if (t && templates.find(tmpl => tmpl.id === t)) setTemplateId(t)
  }, [searchParams, templates])

  function pushStep(step: Step) { setSteps(s => [...s, step]) }
  function updateLastStep(patch: Partial<Step>) {
    setSteps(s => { const c = [...s]; c[c.length - 1] = { ...c[c.length - 1], ...patch }; return c })
  }

  async function processOneCarousel(
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    carousel: any,
    supabase: ReturnType<typeof createClient>,
    userId: string,
    selectedTemplate: Template,
    prefix: string,
  ): Promise<string> {
    const slides: CarouselSlide[] = carousel.slides || []

    // Create DB row
    pushStep({ key: `${prefix}db`, label: `${prefix}Enregistrement`, status: 'running' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newRow, error: insertErr } = await (supabase.from('carousels') as any)
      .insert({ user_id: userId, template_id: templateId, prompt, carousel_type: carousel.carousel_type || '', status: 'generating', slides })
      .select('id').single()
    if (insertErr) throw new Error(insertErr.message)
    const carouselId: string = newRow.id
    setLastCreatedId(carouselId)
    updateLastStep({ status: 'done' })

    // Generate 2 Gemini images
    async function fetchImg(imgPrompt: string, label: string, slideIndex: number): Promise<string> {
      pushStep({ key: `${prefix}img_${label}`, label: `${prefix}Image ${label} (Gemini)`, status: 'running' })
      try {
        const res = await fetch('/api/generate-image', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, carouselId, slideIndex, illustrationPrompt: imgPrompt }),
        })
        if (!res.ok) { const { error } = await res.json(); throw new Error(error) }
        const { url } = await res.json()
        updateLastStep({ status: 'done' })
        return url
      } catch (err) {
        updateLastStep({ status: 'error', error: err instanceof Error ? err.message : String(err) })
        return ''
      }
    }

    let titleBg = ''
    let contentBg = ''
    if (carousel.image_prompt_title) titleBg = await fetchImg(carousel.image_prompt_title, 'titre', 1)
    if (carousel.image_prompt_content) contentBg = await fetchImg(carousel.image_prompt_content, 'contenu', 2)

    const updatedSlides: CarouselSlide[] = slides.map(s => ({
      ...s,
      background_url: s.index === 1 ? (titleBg || undefined) : (contentBg || undefined),
    }))

    // Render + upload slides
    const renderedSlides: CarouselSlide[] = []
    for (const slide of updatedSlides) {
      pushStep({ key: `${prefix}render_${slide.index}`, label: `${prefix}Slide ${slide.index}`, status: 'running' })
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
        updateLastStep({ status: 'done' })
      } catch (err) {
        updateLastStep({ status: 'error', error: err instanceof Error ? err.message : String(err) })
        renderedSlides.push(slide)
      }
    }

    // Finalize
    pushStep({ key: `${prefix}finalize`, label: `${prefix}Finalisation`, status: 'running' })
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('carousels') as any).update({ status: 'completed', slides: renderedSlides }).eq('id', carouselId)
    updateLastStep({ status: 'done' })

    return carouselId
  }

  async function handleGenerate() {
    setLoading(true)
    setSteps([])
    setLastCreatedId(null)
    setDoneIds([])
    setTab('processus')

    const supabase = createClient()
    const selectedTemplate = templates.find(t => t.id === templateId)!
    const { data: { user } } = await supabase.auth.getUser()

    try {
      // 1. Generate all texts in one Claude call
      pushStep({ key: 'text', label: `Génération des textes — ${count} carousel(s) (Claude)`, status: 'running' })
      const textRes = await fetch('/api/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, prompt, count }),
      })
      if (!textRes.ok) { const { error } = await textRes.json(); throw new Error(error || 'Échec génération texte') }
      const { carousels } = await textRes.json()
      updateLastStep({ status: 'done' })

      // 2. Load fonts once
      pushStep({ key: 'fonts', label: 'Chargement des polices', status: 'running' })
      await ensureFontsLoaded(selectedTemplate.layout)
      updateLastStep({ status: 'done' })

      // 3. Process each carousel sequentially
      const ids: string[] = []
      for (let i = 0; i < carousels.length; i++) {
        const prefix = carousels.length > 1 ? `Carousel ${i + 1} — ` : ''
        const id = await processOneCarousel(carousels[i], supabase, user!.id, selectedTemplate, prefix)
        ids.push(id)
        setDoneIds([...ids])
      }

      // 4. Navigate to last created
      setTimeout(() => router.push(`/gallery/${ids[ids.length - 1]}`), 600)
    } catch (err) {
      updateLastStep({ status: 'error', error: err instanceof Error ? err.message : String(err) })
      if (lastCreatedId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('carousels') as any).update({ status: 'failed', error_message: String(err) }).eq('id', lastCreatedId)
      }
    } finally {
      setLoading(false)
    }
  }

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
            {t === 'processus' && steps.length > 0 && (
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
            <label className="block text-xs text-ink-600 mb-2">Nombre de carousels</label>
            <div className="flex gap-2">
              {[1, 2, 3, 4, 5].map(n => (
                <button key={n} onClick={() => setCount(n)}
                  className={`w-9 h-9 rounded-full text-sm font-medium transition ${count === n ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'}`}>
                  {n}
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
            {loading ? 'Génération en cours…' : `Générer ${count > 1 ? `${count} carousels` : 'le carousel'}`}
          </button>
        </div>
      )}

      {/* Tab: Processus */}
      {tab === 'processus' && (
        <div className="p-6">
          {steps.length === 0 ? (
            <p className="text-sm text-ink-600/60 text-center py-8">Lance une génération pour voir le processus ici.</p>
          ) : (
            <ul className="space-y-2">
              {steps.map((s, idx) => (
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
          {doneIds.length > 0 && !loading && (
            <div className="mt-6 flex gap-3 flex-wrap">
              {doneIds.map((id, i) => (
                <a key={id} href={`/gallery/${id}`}
                  className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900 text-white rounded-full text-sm hover:bg-ink-800 shadow-card">
                  Voir le carousel {doneIds.length > 1 ? i + 1 : ''}
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

function StepIcon({ status }: { status: Step['status'] }) {
  if (status === 'done')
    return <div className="w-5 h-5 rounded-full bg-pastel-mint flex items-center justify-center"><Check size={12} className="text-ink-900" /></div>
  if (status === 'error')
    return <div className="w-5 h-5 rounded-full bg-pastel-pinkDeep flex items-center justify-center"><X size={12} className="text-white" /></div>
  if (status === 'running')
    return <Loader2 size={16} className="animate-spin text-ink-600" />
  return <div className="w-5 h-5 rounded-full border border-cream-200" />
}
