import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCarousels as generateCarouselsGemini } from '@/lib/gemini-text'
import { generateCarousels as generateCarouselsClaude } from '@/lib/anthropic'
import { createLogger } from '@/lib/logger'
import { randomUUID } from 'crypto'

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)]
}

function buildImageChoicesBlock(): string {
  const hairColors = ['black', 'brown', 'white', 'blond']
  const framings = ['close-up', 'really close-up', 'head and shoulders', 'head and chest']
  const eyes = ['open eyes', 'eyes closed']

  const titleHair = pick(hairColors)
  const contentHair = pick(hairColors.filter(c => c !== titleHair))

  return `\nRANDOMIZED IMAGE CHOICES — use EXACTLY these values when writing image_prompt_title and image_prompt_content, no substitution allowed:
- image_prompt_title → framing: "${pick(framings)}", hair: "${titleHair}", eyes: "${pick(eyes)}"
- image_prompt_content → hair: "${contentHair}", eyes: "${pick(eyes)}"`
}

export const maxDuration = 300

type ProfileRow = {
  master_instructions: string
  avatar_instructions: string
  gemini_api_key: string | null
  anthropic_api_key: string | null
}

import type { TemplateLayout, TextElement } from '@/types/database'

type TemplateRow = {
  style_guide: string
  carousel_instructions: string
  avatar_instructions: string
  layout: TemplateLayout
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const {
    templateId,
    prompt: userPrompt,
    llm = 'gemini',
    runId: incomingRunId,
    historyBlock = '',
    carouselTag = '',
    images = [],
  } = body as {
    templateId: string
    prompt?: string
    llm?: 'gemini' | 'claude'
    runId?: string
    historyBlock?: string
    carouselTag?: string
    images?: { base64: string; mimeType: string }[]
  }

  const runId = incomingRunId || randomUUID()
  const log = createLogger(supabase, user.id, runId)
  await log({ step: 'text_one.start', message: `generate-text-one start tag=${carouselTag}`, payload: { templateId, userPrompt, llm, carouselTag } })

  if (!templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 })
  }

  const generateCarousels = llm === 'claude' ? generateCarouselsClaude : generateCarouselsGemini

  const { data: profile } = await supabase
    .from('profiles')
    .select('master_instructions, avatar_instructions, gemini_api_key, anthropic_api_key')
    .eq('id', user.id)
    .single<ProfileRow>()

  const { data: template } = await supabase
    .from('templates')
    .select('style_guide, carousel_instructions, avatar_instructions, layout')
    .eq('id', templateId)
    .eq('user_id', user.id)
    .single<TemplateRow>()

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const apiKey = llm === 'claude'
    ? (profile?.anthropic_api_key || process.env.ANTHROPIC_API_KEY)
    : (profile?.gemini_api_key || process.env.GEMINI_API_KEY)
  if (!apiKey) {
    return NextResponse.json(
      { error: `Clé API ${llm === 'claude' ? 'Anthropic' : 'Gemini'} manquante. Renseignez-la dans Paramètres.` },
      { status: 400 }
    )
  }

  // Build the per-slide-type role map from the template layout.
  const rolesByType: Record<string, string[]> = {}
  for (const st of template.layout.slideTypes || []) rolesByType[st] = []
  for (const el of template.layout.elements || []) {
    if (el.type === 'text') {
      const textEl = el as TextElement
      if (!rolesByType[el.slideType]) rolesByType[el.slideType] = []
      const roles: string[] =
        textEl.paragraphs && textEl.paragraphs.length > 0
          ? textEl.paragraphs.map((p) => p.role ?? textEl.role)
          : [textEl.role]
      for (const role of roles) {
        if (!rolesByType[el.slideType].includes(role)) rolesByType[el.slideType].push(role)
      }
    }
  }

  try {
    const imageChoices = buildImageChoicesBlock()
    await log({ step: 'text_one.image_choices', message: 'randomized image choices injected', payload: { imageChoices } })

    const carousels = await generateCarousels({
      apiKey,
      styleGuide: template.style_guide,
      carouselInstructions: template.carousel_instructions,
      masterInstructions: profile?.master_instructions,
      avatarInstructions: template.avatar_instructions || profile?.avatar_instructions,
      userPrompt: (userPrompt || '') + imageChoices,
      historyBlock,
      count: 1,
      rolesByType,
      images,
      log,
      carouselTag,
    })

    const carousel = Array.isArray(carousels) ? carousels[0] : carousels
    if (!carousel) {
      throw new Error('No carousel returned by LLM')
    }

    await log({ step: 'text_one.done', message: `generate-text-one done tag=${carouselTag}`, payload: { tag: carouselTag } })
    return NextResponse.json({ carousel, runId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await log({ step: 'text_one.error', message: `generate-text-one failed: ${message}`, level: 'error', payload: { tag: carouselTag, stack: err instanceof Error ? err.stack : null } })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
