'use client'

import { useState, useEffect, useRef } from 'react'
import { useRouter, useSearchParams } from 'next/navigation'
import { Sparkles, Loader2, Check, X, ArrowRight, StopCircle, ImagePlus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { renderSlideToDataUrl, ensureFontsLoaded } from '@/lib/konva-render'
import type { CarouselSlide, TemplateLayout } from '@/types/database'

type UploadedImage = { base64: string; mimeType: string; preview: string }
const MAX_IMAGES = 10

async function compressImage(file: File): Promise<UploadedImage> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader()
    reader.onerror = reject
    reader.onload = (e) => {
      const img = new window.Image()
      img.onerror = reject
      img.onload = () => {
        const MAX = 1024
        const scale = Math.min(1, MAX / Math.max(img.width, img.height))
        const w = Math.round(img.width * scale)
        const h = Math.round(img.height * scale)
        const canvas = document.createElement('canvas')
        canvas.width = w
        canvas.height = h
        canvas.getContext('2d')!.drawImage(img, 0, 0, w, h)
        const dataUrl = canvas.toDataURL('image/jpeg', 0.8)
        resolve({ base64: dataUrl.split(',')[1], mimeType: 'image/jpeg', preview: dataUrl })
      }
      img.src = e.target!.result as string
    }
    reader.readAsDataURL(file)
  })
}

type Template = { id: string; name: string; layout: TemplateLayout }
type CarouselStatus =
  | 'queued'        // waiting in queue (e.g. retry round)
  | 'text'          // generating text
  | 'images'        // generating images
  | 'rendering'     // rendering slides
  | 'done'
  | 'error'         // failed (final, after retries exhausted)
  | 'cancelled'     // user-cancelled

type CarouselState = {
  idx: number
  label: string
  status: CarouselStatus
  attempts: number
  error?: string
  id?: string
  prompt: string
  abortController?: AbortController
}
type Tab = 'creation' | 'processus'

const MAX_ATTEMPTS = 3

function isRetryableError(err: unknown): boolean {
  if (err instanceof DOMException && err.name === 'AbortError') return false
  if (err instanceof Error) {
    const msg = err.message.toLowerCase()
    // Permanent errors — no retry
    if (msg.includes('unauthorized')) return false
    if (msg.includes('clé api')) return false
    if (msg.includes('template not found')) return false
    if (msg.includes('cancelled')) return false
    // Vercel function timeouts and network errors
    if (msg.includes('timeout')) return true
    if (msg.includes('failed to fetch')) return true
    if (msg.includes('network')) return true
    if (msg.includes('rate limit') || msg.includes('429')) return true
    if (msg.includes('500') || msg.includes('502') || msg.includes('503') || msg.includes('504')) return true
    return true // default: retry unknown errors
  }
  return true
}

export function GenerateForm({ templates }: { templates: Template[] }) {
  const router = useRouter()
  const searchParams = useSearchParams()
  const [tab, setTab] = useState<Tab>('creation')
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')
  const [llm, setLlm] = useState<'gemini' | 'claude' | 'chatgpt'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('preferredLlm') as 'gemini' | 'claude' | 'chatgpt') || 'gemini'
    return 'gemini'
  })
  const [imageLlm, setImageLlm] = useState<'openai' | 'gemini'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('preferredImageLlm') as 'openai' | 'gemini') || 'openai'
    return 'openai'
  })
  const [imageQuality, setImageQuality] = useState<'low' | 'medium' | 'high'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('preferredImageQuality') as 'low' | 'medium' | 'high') || 'low'
    return 'low'
  })
  const [imageFormat, setImageFormat] = useState<'1:1' | '9:16'>(() => {
    if (typeof window !== 'undefined') return (localStorage.getItem('preferredImageFormat') as '1:1' | '9:16') || '1:1'
    return '1:1'
  })
  const [prompt, setPrompt] = useState('')
  const [images, setImages] = useState<UploadedImage[]>([])
  const [loading, setLoading] = useState(false)
  const [globalError, setGlobalError] = useState<string | null>(null)
  const [carouselStates, setCarouselStates] = useState<CarouselState[]>([])
  const carouselStatesRef = useRef<CarouselState[]>([])
  const stoppedRef = useRef<Set<number>>(new Set())
  const stopAllRef = useRef(false)

  useEffect(() => {
    const p = searchParams.get('prompt')
    const t = searchParams.get('templateId')
    if (p) setPrompt(p)
    if (t && templates.find(tmpl => tmpl.id === t)) setTemplateId(t)
  }, [searchParams, templates])

  function updateCarousel(idx: number, patch: Partial<CarouselState>) {
    carouselStatesRef.current = carouselStatesRef.current.map(c =>
      c.idx === idx ? { ...c, ...patch } : c
    )
    setCarouselStates([...carouselStatesRef.current])
  }

  /**
   * Process a single carousel end-to-end: text → images → rendering.
   * Throws on failure so the retry orchestrator can pick it up.
   */
  async function processOneCarousel(
    idx: number,
    runId: string,
    historyBlock: string,
    selectedTemplate: Template,
    userId: string,
    supabase: ReturnType<typeof createClient>,
  ): Promise<string> {
    const state = carouselStatesRef.current.find(c => c.idx === idx)!
    const ac = new AbortController()
    updateCarousel(idx, { abortController: ac, status: 'text', error: undefined })

    if (stoppedRef.current.has(idx) || stopAllRef.current) {
      throw new Error('cancelled')
    }

    // 1. Generate text for this single carousel
    const textRes = await fetch('/api/generate-text-one', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        templateId,
        prompt: state.prompt,
        llm,
        runId,
        historyBlock,
        carouselTag: String(idx + 1),
        images: images.map(({ base64, mimeType }) => ({ base64, mimeType })),
      }),
      signal: ac.signal,
    })
    if (!textRes.ok) {
      const errBody = await textRes.json().catch(() => ({ error: `HTTP ${textRes.status}` }))
      throw new Error(errBody.error || `HTTP ${textRes.status}`)
    }
    const { carousel } = await textRes.json()
    const slides: CarouselSlide[] = carousel.slides || []
    const label = carousel.carousel_type || `Carousel ${idx + 1}`
    updateCarousel(idx, { label })

    if (stoppedRef.current.has(idx) || stopAllRef.current) throw new Error('cancelled')

    // 2. Create DB row (so cancellation can clean up storage too)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: newRow, error: insertErr } = await (supabase.from('carousels') as any)
      .insert({
        user_id: userId,
        template_id: templateId,
        prompt,
        carousel_type: carousel.carousel_type || '',
        status: 'generating',
        slides,
      })
      .select('id').single()
    if (insertErr) throw new Error(insertErr.message)
    const carouselId: string = newRow.id
    updateCarousel(idx, { id: carouselId, status: 'images' })

    // 3. Generate images only for slide types that have a generated image element
    const generatedImageSlideTypes = new Set(
      (selectedTemplate.layout.elements ?? [])
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .filter((el: any) => el.type === 'image' && el.source === 'generated')
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        .map((el: any) => el.slideType as string)
    )

    async function fetchImg(imgPrompt: string, slideIndex: number, slideType: string): Promise<string> {
      if (!imgPrompt) return ''
      const res = await fetch('/api/generate-image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ templateId, carouselId, slideIndex, illustrationPrompt: imgPrompt, slideType, runId, imageQuality, imageLlm, imageFormat }),
        signal: ac.signal,
      })
      if (!res.ok) {
        const errBody = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        throw new Error(errBody.error || `HTTP ${res.status}`)
      }
      const { url } = await res.json()
      return url
    }

    // The LLM produces exactly two image prompts per carousel:
    //   - image_prompt_title → used for the title slide
    //   - image_prompt_content → SHARED by every content slide, regardless of
    //     how many content variants the layout defines (content_1, content_2,
    //     content_3, cta, ...). Templates may define multiple content variants
    //     for purely layout-related reasons (with/without subtitle, etc.) —
    //     they all share the same background image.
    //
    // We therefore generate AT MOST two images: one for the title group, one
    // for the content group. All slide types in a group share the URL.
    const titleSlideTypes = [...generatedImageSlideTypes].filter(
      (st) => st === 'title' || st.startsWith('title')
    )
    const contentSlideTypes = [...generatedImageSlideTypes].filter(
      (st) => !(st === 'title' || st.startsWith('title'))
    )

    const imageByType: Record<string, string> = {}
    const imagePromises: Promise<void>[] = []

    if (titleSlideTypes.length > 0 && carousel.image_prompt_title) {
      imagePromises.push(
        (async () => {
          const url = await fetchImg(carousel.image_prompt_title!, 1, titleSlideTypes[0])
          if (url) for (const st of titleSlideTypes) imageByType[st] = url
        })()
      )
    }

    if (contentSlideTypes.length > 0 && carousel.image_prompt_content) {
      imagePromises.push(
        (async () => {
          const url = await fetchImg(carousel.image_prompt_content!, 2, contentSlideTypes[0])
          if (url) for (const st of contentSlideTypes) imageByType[st] = url
        })()
      )
    }

    await Promise.all(imagePromises)

    if (stoppedRef.current.has(idx) || stopAllRef.current) throw new Error('cancelled')

    const updatedSlides: CarouselSlide[] = slides.map(s => ({
      ...s,
      background_url: imageByType[s.slide_type] ?? undefined,
    }))

    // 4. Render + upload slides
    updateCarousel(idx, { status: 'rendering' })
    const renderedSlides: CarouselSlide[] = []
    for (const slide of updatedSlides) {
      if (stoppedRef.current.has(idx) || stopAllRef.current) throw new Error('cancelled')
      const dataUrl = await renderSlideToDataUrl(selectedTemplate.layout, slide, slide.background_url)
      const uploadRes = await fetch('/api/upload-slide', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ carouselId, slideIndex: slide.index, dataUrl }),
        signal: ac.signal,
      })
      if (!uploadRes.ok) {
        const errBody = await uploadRes.json().catch(() => ({ error: `HTTP ${uploadRes.status}` }))
        throw new Error(errBody.error || `HTTP ${uploadRes.status}`)
      }
      const { url } = await uploadRes.json()
      renderedSlides.push({ ...slide, rendered_url: url })
    }

    // 5. Finalize
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('carousels') as any)
      .update({ status: 'completed', slides: renderedSlides })
      .eq('id', carouselId)
    updateCarousel(idx, { status: 'done' })
    return carouselId
  }

  /**
   * Cancel a carousel: abort in-flight requests + delete DB row + storage cleanup.
   */
  async function cancelOne(idx: number) {
    stoppedRef.current.add(idx)
    const state = carouselStatesRef.current.find(c => c.idx === idx)
    if (!state) return
    state.abortController?.abort()
    if (state.id) {
      try {
        await fetch(`/api/carousels/${state.id}`, { method: 'DELETE' })
      } catch { /* ignore */ }
    }
    updateCarousel(idx, { status: 'cancelled', error: undefined })
  }

  /**
   * Cancel ALL carousels currently in progress.
   */
  async function cancelAll() {
    stopAllRef.current = true
    const toCancel = carouselStatesRef.current.filter(
      c => c.status !== 'done' && c.status !== 'error' && c.status !== 'cancelled'
    )
    await Promise.all(toCancel.map(c => cancelOne(c.idx)))
    setLoading(false)
  }

  async function handleGenerate() {
    setLoading(true)
    setGlobalError(null)
    setCarouselStates([])
    carouselStatesRef.current = []
    stoppedRef.current = new Set()
    stopAllRef.current = false
    setTab('processus')

    const supabase = createClient()
    const selectedTemplate = templates.find(t => t.id === templateId)!
    const { data: { user } } = await supabase.auth.getUser()

    try {
      // Phase 1: extract intent (count + per-carousel prompts)
      const intentRes = await fetch('/api/extract-intent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, llm }),
      })
      if (!intentRes.ok) {
        const errBody = await intentRes.json().catch(() => ({ error: `HTTP ${intentRes.status}` }))
        throw new Error(errBody.error || `HTTP ${intentRes.status}`)
      }
      const { count, perCarousel, runId, historyBlock } = await intentRes.json()

      // Phase 2: load fonts (in parallel with showing the cards)
      const fontsPromise = ensureFontsLoaded(selectedTemplate.layout)

      // Phase 3: init N placeholder cards
      const initial: CarouselState[] = Array.from({ length: count }, (_, i) => ({
        idx: i,
        label: `Carousel ${i + 1}`,
        status: 'queued' as CarouselStatus,
        attempts: 0,
        prompt: perCarousel[i] || prompt,
      }))
      carouselStatesRef.current = initial
      setCarouselStates([...initial])

      await fontsPromise

      // Phase 4: retry rounds
      let toProcess = initial.map(c => c.idx)
      while (toProcess.length > 0 && !stopAllRef.current) {
        const round = toProcess
        const results = await Promise.allSettled(
          round.map(idx =>
            processOneCarousel(idx, runId, historyBlock, selectedTemplate, user!.id, supabase)
              .catch(err => {
                // Tag the rejection with idx so we know which carousel failed
                const wrapped = err instanceof Error ? err : new Error(String(err))
                ;(wrapped as Error & { idx?: number }).idx = idx
                throw wrapped
              })
          )
        )

        const nextRound: number[] = []
        results.forEach((r, i) => {
          const idx = round[i]
          if (r.status === 'rejected') {
            const errObj = r.reason as Error
            const message = errObj.message || 'Erreur inconnue'
            // If user cancelled, leave it as 'cancelled' (already set in cancelOne)
            if (stoppedRef.current.has(idx) || message === 'cancelled') {
              return
            }
            const state = carouselStatesRef.current.find(c => c.idx === idx)
            if (!state) return
            const newAttempts = state.attempts + 1
            const canRetry = newAttempts < MAX_ATTEMPTS && isRetryableError(errObj)

            // Cleanup partial DB row if any (so retry starts fresh)
            if (state.id) {
              fetch(`/api/carousels/${state.id}`, { method: 'DELETE' }).catch(() => {})
            }

            if (canRetry) {
              updateCarousel(idx, {
                status: 'queued',
                attempts: newAttempts,
                error: `Tentative ${newAttempts}/${MAX_ATTEMPTS} échouée — relance…`,
                id: undefined,
                abortController: undefined,
              })
              nextRound.push(idx)
            } else {
              updateCarousel(idx, {
                status: 'error',
                attempts: newAttempts,
                error: message,
                id: undefined,
                abortController: undefined,
              })
            }
          }
        })

        toProcess = nextRound
      }

      // Redirect to last successful carousel
      const doneIds = carouselStatesRef.current
        .filter(c => c.status === 'done' && c.id)
        .map(c => c.id!)
      if (doneIds.length > 0 && !stopAllRef.current) {
        setTimeout(() => router.push(`/gallery/${doneIds[doneIds.length - 1]}`), 600)
      }
    } catch (err) {
      setGlobalError(err instanceof Error ? err.message : String(err))
    } finally {
      setLoading(false)
    }
  }

  const totalCarousels = carouselStates.length
  const doneCount = carouselStates.filter(c => c.status === 'done').length
  const errorCount = carouselStates.filter(c => c.status === 'error' || c.status === 'cancelled').length
  const finishedCount = doneCount + errorCount
  const doneIds = carouselStates.filter(c => c.status === 'done' && c.id).map(c => c.id!)
  const anyInProgress = carouselStates.some(c =>
    c.status !== 'done' && c.status !== 'error' && c.status !== 'cancelled'
  )

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
          {/* Text LLM */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-ink-600">Textes</label>
            <div className="flex gap-2">
              {([
                { value: 'gemini',  label: 'Gemini' },
                { value: 'claude',  label: 'Claude' },
                { value: 'chatgpt', label: 'ChatGPT' },
              ] as const).map(({ value, label }) => (
                <button key={value}
                  onClick={() => { setLlm(value); localStorage.setItem('preferredLlm', value) }}
                  className={`px-4 py-2 rounded-full text-sm transition ${llm === value ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'}`}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {/* Image LLM + quality */}
          <div className="flex flex-col gap-1.5">
            <label className="text-xs text-ink-600">Images</label>
            <div className="flex gap-2">
              {([
                { value: 'openai', label: 'GPT Image 2' },
                { value: 'gemini', label: 'Gemini' },
              ] as const).map(({ value, label }) => (
                <button key={value}
                  onClick={() => { setImageLlm(value); localStorage.setItem('preferredImageLlm', value) }}
                  className={`px-4 py-2 rounded-full text-sm transition ${imageLlm === value ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'}`}>
                  {label}
                </button>
              ))}
            </div>
            {/* Format */}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-ink-500">Format</span>
              {([
                { value: '1:1',  label: '1:1' },
                { value: '9:16', label: '9:16' },
              ] as const).map(({ value, label }) => (
                <button key={value}
                  onClick={() => { setImageFormat(value); localStorage.setItem('preferredImageFormat', value) }}
                  className={`px-3 py-1.5 rounded-full text-xs transition ${imageFormat === value ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'}`}>
                  {label}
                </button>
              ))}
            </div>
            {/* Quality */}
            <div className="flex items-center gap-2 mt-0.5">
              <span className="text-[11px] text-ink-500">Qualité</span>
              {([
                { value: 'low',    label: 'Rapide' },
                { value: 'medium', label: 'Standard' },
                { value: 'high',   label: 'HD' },
              ] as const).map(({ value, label }) => (
                <button key={value}
                  onClick={() => { setImageQuality(value); localStorage.setItem('preferredImageQuality', value) }}
                  className={`px-3 py-1.5 rounded-full text-xs transition ${imageQuality === value ? 'bg-ink-900 text-white' : 'bg-cream-100 text-ink-700 hover:bg-cream-200'}`}>
                  {label}
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

          <ImageUploadZone
            images={images}
            disabled={loading}
            onChange={setImages}
          />

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
          {globalError && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-sm text-red-700">
              {globalError}
            </div>
          )}

          {carouselStates.length > 0 && (
            <>
              <div className="flex items-center justify-between text-xs text-ink-600 mb-1">
                <span>{totalCarousels} carousel{totalCarousels > 1 ? 's' : ''} en parallèle</span>
                <div className="flex items-center gap-3">
                  <span className="font-medium">{finishedCount}/{totalCarousels}</span>
                  {anyInProgress && (
                    <button
                      onClick={cancelAll}
                      className="text-red-600 hover:text-red-700 inline-flex items-center gap-1 font-medium"
                    >
                      <StopCircle size={13} /> Tout arrêter
                    </button>
                  )}
                </div>
              </div>

              <div className="space-y-2">
                {carouselStates.map(c => (
                  <div key={c.idx} className="flex items-center gap-3 py-2.5 px-3 rounded-xl bg-cream-50">
                    <CarouselIcon status={c.status} />
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-ink-800 font-medium truncate">{c.label}</p>
                      <p className="text-xs text-ink-500 truncate">
                        {statusLabel(c.status)}
                        {c.error && c.status !== 'queued' && <span className="text-red-500 ml-1">— {c.error}</span>}
                        {c.error && c.status === 'queued' && <span className="text-ink-500 ml-1">— {c.error}</span>}
                      </p>
                    </div>
                    {(c.status === 'text' || c.status === 'images' || c.status === 'rendering' || c.status === 'queued') && (
                      <button
                        onClick={() => cancelOne(c.idx)}
                        title="Arrêter ce carousel"
                        className="text-ink-400 hover:text-red-600 transition flex-shrink-0"
                      >
                        <StopCircle size={18} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            </>
          )}

          {carouselStates.length === 0 && !globalError && (
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

function ImageUploadZone({
  images,
  disabled,
  onChange,
}: {
  images: UploadedImage[]
  disabled: boolean
  onChange: (imgs: UploadedImage[]) => void
}) {
  const inputRef = useRef<HTMLInputElement>(null)
  const [dragging, setDragging] = useState(false)

  async function handleFiles(files: FileList | null) {
    if (!files || disabled) return
    const remaining = MAX_IMAGES - images.length
    if (remaining <= 0) return
    const toProcess = Array.from(files).slice(0, remaining)
    const compressed = await Promise.all(toProcess.map(compressImage))
    onChange([...images, ...compressed])
  }

  function removeImage(idx: number) {
    onChange(images.filter((_, i) => i !== idx))
  }

  return (
    <div className="space-y-2">
      <label className="block text-xs text-ink-600">
        Images de référence
        <span className="ml-1 text-ink-400">(optionnel — {images.length}/{MAX_IMAGES})</span>
      </label>

      {/* Thumbnail strip */}
      {images.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {images.map((img, i) => (
            <div key={i} className="relative group">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={img.preview}
                alt={`ref ${i + 1}`}
                className="h-16 w-12 object-cover rounded-lg border border-cream-200"
              />
              <button
                type="button"
                onClick={() => removeImage(i)}
                className="absolute -top-1.5 -right-1.5 w-4 h-4 bg-ink-900 text-white rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transition"
              >
                <X size={9} strokeWidth={3} />
              </button>
            </div>
          ))}
        </div>
      )}

      {/* Drop zone */}
      {images.length < MAX_IMAGES && (
        <div
          onDragOver={e => { e.preventDefault(); setDragging(true) }}
          onDragLeave={() => setDragging(false)}
          onDrop={e => { e.preventDefault(); setDragging(false); handleFiles(e.dataTransfer.files) }}
          onClick={() => !disabled && inputRef.current?.click()}
          className={`flex items-center gap-2 px-4 py-2.5 rounded-xl border-2 border-dashed cursor-pointer transition text-sm select-none
            ${dragging
              ? 'border-ink-400 bg-cream-100 text-ink-800'
              : 'border-cream-200 text-ink-500 hover:border-ink-300 hover:text-ink-700'}
            ${disabled ? 'opacity-40 cursor-default' : ''}
          `}
        >
          <ImagePlus size={15} />
          <span>Glisser des captures ou cliquer pour parcourir</span>
        </div>
      )}

      <input
        ref={inputRef}
        type="file"
        accept="image/*"
        multiple
        className="hidden"
        onChange={e => handleFiles(e.target.files)}
      />
    </div>
  )
}

function statusLabel(status: CarouselStatus): string {
  switch (status) {
    case 'queued': return 'En attente…'
    case 'text': return 'Génération des textes…'
    case 'images': return 'Génération des images…'
    case 'rendering': return 'Composition des slides…'
    case 'done': return 'Terminé'
    case 'error': return 'Erreur'
    case 'cancelled': return 'Annulé'
  }
}

function CarouselIcon({ status }: { status: CarouselStatus }) {
  // Done = green check
  if (status === 'done') {
    return (
      <div className="w-7 h-7 rounded-full bg-pastel-mint flex items-center justify-center flex-shrink-0">
        <Check size={14} className="text-ink-900" strokeWidth={3} />
      </div>
    )
  }
  // Error or cancelled = red X
  if (status === 'error' || status === 'cancelled') {
    return (
      <div className="w-7 h-7 rounded-full bg-red-100 flex items-center justify-center flex-shrink-0">
        <X size={14} className="text-red-600" strokeWidth={3} />
      </div>
    )
  }
  // In progress (text/images/rendering/queued) = yellow circle with spinner
  return (
    <div className="w-7 h-7 rounded-full bg-pastel-lemon flex items-center justify-center flex-shrink-0">
      <Loader2 size={14} className="text-ink-900 animate-spin" strokeWidth={2.5} />
    </div>
  )
}
