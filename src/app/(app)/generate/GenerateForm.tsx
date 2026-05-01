'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, Loader2, Check, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { renderSlideToDataUrl, ensureFontsLoaded } from '@/lib/konva-render'
import type { CarouselSlide, TemplateLayout } from '@/types/database'

type Template = {
  id: string
  name: string
  layout: TemplateLayout
}

type Step = {
  key: string
  label: string
  status: 'pending' | 'running' | 'done' | 'error'
  error?: string
}

export function GenerateForm({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const [templateId, setTemplateId] = useState(templates[0].id)
  const [prompt, setPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [steps, setSteps] = useState<Step[]>([])
  const [createdId, setCreatedId] = useState<string | null>(null)

  function pushStep(step: Step) {
    setSteps((s) => [...s, step])
  }
  function updateLastStep(patch: Partial<Step>) {
    setSteps((s) => {
      const copy = [...s]
      copy[copy.length - 1] = { ...copy[copy.length - 1], ...patch }
      return copy
    })
  }

  async function handleGenerate() {
    setLoading(true)
    setSteps([])
    setCreatedId(null)

    const supabase = createClient()
    const selectedTemplate = templates.find((t) => t.id === templateId)!

    try {
      // 1. Generate text via Claude
      pushStep({ key: 'text', label: 'Génération des textes (Claude)', status: 'running' })
      const textRes = await fetch('/api/generate-text', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, prompt, count: 1 }),
      })
      if (!textRes.ok) {
        const { error } = await textRes.json()
        throw new Error(error || 'Échec génération texte')
      }
      const { carousels } = await textRes.json()
      const carousel = carousels[0]
      const slides: CarouselSlide[] = carousel.slides || []
      updateLastStep({ status: 'done' })

      // 2. Create carousel row in DB
      pushStep({ key: 'db', label: 'Enregistrement du carousel', status: 'running' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: { user } } = await supabase.auth.getUser()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: newCarousel, error: insertErr } = await (supabase.from('carousels') as any)
        .insert({
          user_id: user!.id,
          template_id: templateId,
          prompt,
          carousel_type: carousel.carousel_type || '',
          status: 'generating',
          slides,
        })
        .select('id')
        .single()
      if (insertErr) throw new Error(insertErr.message)
      const carouselId: string = newCarousel.id
      setCreatedId(carouselId)
      updateLastStep({ status: 'done' })

      // 3. Generate images via Gemini for each slide that has an illustration_prompt
      const updatedSlides: CarouselSlide[] = []
      for (const slide of slides) {
        if (!slide.illustration_prompt) {
          updatedSlides.push(slide)
          continue
        }
        pushStep({
          key: `img_${slide.index}`,
          label: `Image ${slide.index} (Gemini)`,
          status: 'running',
        })
        try {
          const imgRes = await fetch('/api/generate-image', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              templateId,
              carouselId,
              slideIndex: slide.index,
              illustrationPrompt: slide.illustration_prompt,
            }),
          })
          if (!imgRes.ok) {
            const { error } = await imgRes.json()
            throw new Error(error || 'Échec génération image')
          }
          const { url } = await imgRes.json()
          updatedSlides.push({ ...slide, background_url: url })
          updateLastStep({ status: 'done' })
        } catch (err) {
          updateLastStep({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          })
          updatedSlides.push(slide)
        }
      }

      // 4. Render each slide client-side via Konva
      pushStep({ key: 'fonts', label: 'Chargement des polices', status: 'running' })
      await ensureFontsLoaded(selectedTemplate.layout)
      updateLastStep({ status: 'done' })

      const renderedSlides: CarouselSlide[] = []
      for (const slide of updatedSlides) {
        pushStep({
          key: `render_${slide.index}`,
          label: `Rendu slide ${slide.index}`,
          status: 'running',
        })
        try {
          const dataUrl = await renderSlideToDataUrl(
            selectedTemplate.layout,
            slide,
            slide.background_url
          )
          const uploadRes = await fetch('/api/upload-slide', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              carouselId,
              slideIndex: slide.index,
              dataUrl,
            }),
          })
          if (!uploadRes.ok) {
            const { error } = await uploadRes.json()
            throw new Error(error || 'Échec upload')
          }
          const { url } = await uploadRes.json()
          renderedSlides.push({ ...slide, rendered_url: url })
          updateLastStep({ status: 'done' })
        } catch (err) {
          updateLastStep({
            status: 'error',
            error: err instanceof Error ? err.message : String(err),
          })
          renderedSlides.push(slide)
        }
      }

      // 5. Update carousel row with final slides
      pushStep({ key: 'finalize', label: 'Finalisation', status: 'running' })
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('carousels') as any)
        .update({ status: 'completed', slides: renderedSlides })
        .eq('id', carouselId)
      updateLastStep({ status: 'done' })

      // Redirect to gallery detail after short pause
      setTimeout(() => router.push(`/gallery/${carouselId}`), 800)
    } catch (err) {
      updateLastStep({
        status: 'error',
        error: err instanceof Error ? err.message : String(err),
      })
      if (createdId) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('carousels') as any)
          .update({ status: 'failed', error_message: String(err) })
          .eq('id', createdId)
      }
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="space-y-4">
      <div className="bg-white rounded-xl2 p-6 shadow-soft">
        <label className="block text-xs text-ink-600 mb-2">Template</label>
        <div className="flex gap-2 flex-wrap mb-5">
          {templates.map((t) => (
            <button
              key={t.id}
              onClick={() => setTemplateId(t.id)}
              className={`px-4 py-2 rounded-full text-sm transition ${
                templateId === t.id
                  ? 'bg-ink-900 text-white'
                  : 'bg-cream-100 text-ink-700 hover:bg-cream-200'
              }`}
            >
              {t.name}
            </button>
          ))}
        </div>

        <label className="block text-xs text-ink-600 mb-2">
          Idée / instruction (optionnel)
        </label>
        <textarea
          className="textarea min-h-[120px]"
          placeholder="Ex: un carousel sur le syndrome de l'imposteur chez les femmes TDAH..."
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          disabled={loading}
        />

        <button
          onClick={handleGenerate}
          disabled={loading}
          className="mt-4 inline-flex items-center gap-2 px-5 py-3 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 disabled:opacity-50 shadow-card"
        >
          {loading ? <Loader2 size={14} className="animate-spin" /> : <Sparkles size={14} />}
          {loading ? 'Génération en cours...' : 'Générer le carousel'}
        </button>
      </div>

      {steps.length > 0 && (
        <div className="bg-white rounded-xl2 p-6 shadow-soft">
          <h3 className="font-display text-lg font-semibold text-ink-900 mb-3">
            Progression
          </h3>
          <ul className="space-y-2">
            {steps.map((s, idx) => (
              <li key={`${s.key}_${idx}`} className="flex items-center gap-3 text-sm">
                <StepIcon status={s.status} />
                <span
                  className={
                    s.status === 'error' ? 'text-red-600' : 'text-ink-700'
                  }
                >
                  {s.label}
                  {s.error && <span className="text-xs text-red-600 ml-2">— {s.error}</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

function StepIcon({ status }: { status: Step['status'] }) {
  if (status === 'done')
    return (
      <div className="w-5 h-5 rounded-full bg-pastel-mint flex items-center justify-center">
        <Check size={12} className="text-ink-900" />
      </div>
    )
  if (status === 'error')
    return (
      <div className="w-5 h-5 rounded-full bg-pastel-pinkDeep flex items-center justify-center">
        <X size={12} className="text-white" />
      </div>
    )
  if (status === 'running')
    return <Loader2 size={16} className="animate-spin text-ink-600" />
  return <div className="w-5 h-5 rounded-full border border-cream-200" />
}
