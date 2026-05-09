import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCarousels as generateCarouselsGemini } from '@/lib/gemini-text'
import { generateCarousels as generateCarouselsClaude } from '@/lib/anthropic'
import { createLogger } from '@/lib/logger'
import { resolveChoices } from '@/lib/resolve-choices'
import { randomUUID } from 'crypto'


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
  randomization_instructions: string
  absolute_rules: string
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
    .select('style_guide, carousel_instructions, avatar_instructions, randomization_instructions, absolute_rules, layout')
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

  // Build the per-slide-type role map and highlight-enabled roles from the template layout.
  const rolesByType: Record<string, string[]> = {}
  const highlightRoles: Record<string, string[]> = {}
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
      // Track which roles have highlight enabled
      for (const p of textEl.paragraphs ?? []) {
        if (p.highlight) {
          const role = p.role ?? textEl.role
          if (!highlightRoles[el.slideType]) highlightRoles[el.slideType] = []
          if (!highlightRoles[el.slideType].includes(role)) highlightRoles[el.slideType].push(role)
        }
      }
    }
  }

  try {
    // Resolve [[option1 | option2 (weight%)]] markers in all instruction fields
    const resolvedCarouselInstructions = resolveChoices(template.carousel_instructions)
    const resolvedStyleGuide = resolveChoices(template.style_guide)
    const resolvedMaster = profile?.master_instructions ? resolveChoices(profile.master_instructions) : undefined
    const resolvedAvatar = resolveChoices(template.avatar_instructions || profile?.avatar_instructions || '')
    const resolvedRandomization = resolveChoices(template.randomization_instructions || '')
    await log({ step: 'text_one.randomization', message: 'randomization_instructions resolved', payload: { resolvedRandomization } })

    const absoluteRules = template.absolute_rules || ''

    await log({
      step: 'text_one.resolve_choices',
      message: 'resolved [[...]] markers in instructions',
      payload: {
        carouselChanged: resolvedCarouselInstructions !== template.carousel_instructions,
        styleChanged: resolvedStyleGuide !== template.style_guide,
        masterChanged: resolvedMaster !== profile?.master_instructions,
      },
    })

    const carousels = await generateCarousels({
      apiKey,
      styleGuide: resolvedStyleGuide,
      carouselInstructions: resolvedCarouselInstructions,
      masterInstructions: resolvedMaster,
      absoluteRules,
      avatarInstructions: resolvedAvatar,
      userPrompt: (userPrompt || '') + (resolvedRandomization ? '\n\n' + resolvedRandomization : ''),
      historyBlock,
      count: 1,
      rolesByType,
      highlightRoles,
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
