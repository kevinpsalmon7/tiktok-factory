import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCarousels as generateCarouselsGemini } from '@/lib/gemini-text'
import { generateCarousels as generateCarouselsClaude } from '@/lib/anthropic'
import { generateCarousels as generateCarouselsChatGPT } from '@/lib/openai-text'
import { createLogger } from '@/lib/logger'
import { resolveChoices } from '@/lib/resolve-choices'
import { randomUUID } from 'crypto'

/**
 * Detect an explicit title in the user's prompt and return it verbatim.
 *
 * Strategy — three layers, fall-through:
 *   1. Strong patterns: "titre/title" + verb + quoted string
 *      (e.g. `le titre sera "X"`, `the title is "X"`, `titled "X"`)
 *   2. Looser patterns: legacy `titre : X` / `avec le titre X` patterns
 *   3. Fallback: if prompt mentions "titre" or "title" AND contains any
 *      quoted string, take the first quoted string as the title.
 *
 * Quotes accepted: "..."  '...'  «...»  "..."  '...'
 *
 * Returns null only if there is genuinely no signal at all.
 */
function extractExactTitle(prompt: string): string | null {
  // All quote-flavours, opening + closing
  const Q_OPEN = '["«"\'`‘“]'
  const Q_CLOSE = '["»"\'`’”]'

  // Layer 1 — title keyword + (verb)? + quoted string. Very tolerant.
  const strongPatterns = [
    // FR: le/ce titre (sera|est|doit être|c'est|: ) "X"
    new RegExp(`(?:le|ce|du|au|comme|pour)\\s+titre\\s+(?:sera|est|doit\\s+être|c['’]est|:\\s*)?\\s*${Q_OPEN}([^"«»'\`\\n\\u2018\\u201C\\u2019\\u201D]{2,200}?)${Q_CLOSE}`, 'i'),
    // FR: dont le titre (sera|est|...) "X"
    new RegExp(`dont\\s+(?:le|ce)\\s+titre\\s+(?:sera|est|doit\\s+être|c['’]est|:\\s*)?\\s*${Q_OPEN}([^"«»'\`\\n\\u2018\\u201C\\u2019\\u201D]{2,200}?)${Q_CLOSE}`, 'i'),
    // FR: titre :/= "X"
    new RegExp(`\\btitre\\s*[:=]\\s*${Q_OPEN}([^"«»'\`\\n\\u2018\\u201C\\u2019\\u201D]{2,200}?)${Q_CLOSE}`, 'i'),
    // FR: intitulé "X"
    new RegExp(`intitul[ée]\\s+${Q_OPEN}([^"«»'\`\\n\\u2018\\u201C\\u2019\\u201D]{2,200}?)${Q_CLOSE}`, 'i'),
    // EN: (the|this|a) title (is|will be|should be|=|:) "X"
    new RegExp(`(?:the|this|a)?\\s*title\\s+(?:is|will\\s+be|should\\s+be|must\\s+be|=|:)?\\s*${Q_OPEN}([^"«»'\`\\n\\u2018\\u201C\\u2019\\u201D]{2,200}?)${Q_CLOSE}`, 'i'),
    // EN: titled "X" / called "X" / named "X"
    new RegExp(`(?:titled|called|named|entitled)\\s+${Q_OPEN}([^"«»'\`\\n\\u2018\\u201C\\u2019\\u201D]{2,200}?)${Q_CLOSE}`, 'i'),
  ]
  for (const pattern of strongPatterns) {
    const m = prompt.match(pattern)
    if (m?.[1]?.trim()) return m[1].trim()
  }

  // Layer 2 — looser legacy patterns (no quotes required)
  const loosePatterns = [
    /\btitre\s*[:=]\s*["«»"'`‘“]?([^\n"«»'`‘“’”]{2,200}?)["»"'`’”]?\s*$/im,
    /\bce titre\s+["«»"'`‘“]?([^\n"«»'`‘“’”]{2,200}?)["»"'`’”]?\s*$/im,
    /\bavec\s+(?:le|ce)?\s*titre\s+["«»"'`‘“]?([^\n"«»'`‘“’”]{2,200}?)["»"'`’”]?\s*$/im,
  ]
  for (const pattern of loosePatterns) {
    const m = prompt.match(pattern)
    if (m?.[1]?.trim()) return m[1].trim()
  }

  // Layer 3 — fallback: prompt mentions title AND has a quoted string → trust it
  const mentionsTitle = /\b(?:titre|title|titled|entitled|intitul[ée])\b/i.test(prompt)
  if (mentionsTitle) {
    const quoted = prompt.match(new RegExp(`${Q_OPEN}([^"«»'\`\\n\\u2018\\u201C\\u2019\\u201D]{3,200}?)${Q_CLOSE}`))
    if (quoted?.[1]?.trim()) return quoted[1].trim()
  }

  return null
}

type SlideOverride = {
  slideIndex: number
  text: string
}

/**
 * Detect explicit per-slide content overrides in the user's prompt.
 * Recognised patterns (case-insensitive, French + English):
 *   - slide 2 = some text
 *   - slide 2: some text
 *   - slide 2 - some text
 *   - diapo 2 = some text
 *   - diapositive 3: some text
 * Multiple overrides can appear on one line (comma-separated) or on separate lines.
 */
function extractSlideOverrides(prompt: string): SlideOverride[] {
  const overrides: SlideOverride[] = []
  // Match up to the next slide/diapo keyword, a comma, a newline, or end of string/line
  const pattern = /(?:slide|diapo(?:sitive)?)\s+(\d+)\s*[=:\-]\s*(.+?)(?=,\s*(?:slide|diapo(?:sitive)?)\s+\d+|$)/gim
  let match
  while ((match = pattern.exec(prompt)) !== null) {
    const slideIndex = parseInt(match[1], 10)
    const text = match[2].trim()
    if (slideIndex > 0 && text) {
      overrides.push({ slideIndex, text })
    }
  }
  return overrides
}

export const maxDuration = 300

type ProfileRow = {
  master_instructions: string
  avatar_instructions: string
  gemini_api_key: string | null
  anthropic_api_key: string | null
  openai_api_key: string | null
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
    originalPrompt,
    llm = 'gemini' as 'gemini' | 'claude' | 'chatgpt',
    runId: incomingRunId,
    historyBlock = '',
    carouselTag = '',
    images = [],
    forcedTitle,
  } = body as {
    templateId: string
    prompt?: string
    originalPrompt?: string   // full original dashboard prompt — used for programmatic override extraction
    llm?: 'gemini' | 'claude' | 'chatgpt'
    runId?: string
    historyBlock?: string
    carouselTag?: string
    images?: { base64: string; mimeType: string }[]
    forcedTitle?: string
  }

  const runId = incomingRunId || randomUUID()
  const log = createLogger(supabase, user.id, runId)
  await log({ step: 'text_one.start', message: `generate-text-one start tag=${carouselTag}`, payload: { templateId, userPrompt, llm, carouselTag } })

  if (!templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 })
  }

  const generateCarousels = llm === 'claude' ? generateCarouselsClaude : llm === 'chatgpt' ? generateCarouselsChatGPT : generateCarouselsGemini

  const { data: profile } = await supabase
    .from('profiles')
    .select('master_instructions, avatar_instructions, gemini_api_key, anthropic_api_key, openai_api_key')
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
    : llm === 'chatgpt'
    ? (profile?.openai_api_key || process.env.OPENAI_API_KEY)
    : (profile?.gemini_api_key || process.env.GEMINI_API_KEY)
  if (!apiKey) {
    const providerLabel = llm === 'claude' ? 'Anthropic' : llm === 'chatgpt' ? 'OpenAI' : 'Gemini'
    return NextResponse.json(
      { error: `Clé API ${providerLabel} manquante. Renseignez-la dans Paramètres.` },
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
          ? textEl.paragraphs
              .filter((p) => !p.separatorHeight)  // skip pure spacers
              .map((p) => p.role ?? textEl.role)
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
      contentSlideRange: template.layout.contentSlideRange,
    })

    const carousel = Array.isArray(carousels) ? carousels[0] : carousels
    if (!carousel) {
      throw new Error('No carousel returned by LLM')
    }

    // Hard-enforce an exact title.
    // Priority: forcedTitle (explicit bullet from dashboard) > pattern match on the ORIGINAL prompt
    // (never the reformulated per-carousel prompt — extractIntent might have lost the title).
    const exactTitle = forcedTitle?.trim() || extractExactTitle(originalPrompt || userPrompt || '')
    if (exactTitle && Array.isArray(carousel.slides)) {
      const titleTypes = (template.layout.slideTypes || []).filter(
        (st: string) => st === 'title' || st.startsWith('title')
      )
      carousel.slides = carousel.slides.map((slide: { slide_type: string; text_fields: Record<string, string> }) => {
        if (!titleTypes.includes(slide.slide_type)) return slide
        // Replace the first text_field key that holds the title role
        const fields = { ...slide.text_fields }
        const titleKey = Object.keys(fields).find(k => k === 'title' || k === 'titre') ?? Object.keys(fields)[0]
        if (titleKey) fields[titleKey] = exactTitle
        return { ...slide, text_fields: fields }
      })
      await log({ step: 'text_one.exact_title', message: `exact title enforced: "${exactTitle}"`, payload: { exactTitle } })
    }

    // Hard-enforce per-slide text overrides (e.g. "slide 2 = xxx, slide 3 = yyy").
    // Run on the ORIGINAL full prompt — not the per-carousel reformulation —
    // so instructions are never lost through extractIntent.
    const slideOverrides = extractSlideOverrides(originalPrompt || userPrompt || '')
    if (slideOverrides.length > 0 && Array.isArray(carousel.slides)) {
      carousel.slides = carousel.slides.map((slide: { index: number; slide_type: string; text_fields: Record<string, string> }) => {
        const override = slideOverrides.find(o => o.slideIndex === slide.index)
        if (!override) return slide
        const fields = { ...slide.text_fields }
        // Replace the primary text field: prefer 'text' > 'content' > first key
        const primaryKey =
          Object.keys(fields).find(k => k === 'text') ??
          Object.keys(fields).find(k => k === 'content') ??
          Object.keys(fields)[0]
        if (primaryKey) fields[primaryKey] = override.text
        return { ...slide, text_fields: fields }
      })
      await log({ step: 'text_one.slide_overrides', message: `${slideOverrides.length} slide override(s) enforced`, payload: { slideOverrides } })
    }

    await log({ step: 'text_one.done', message: `generate-text-one done tag=${carouselTag}`, payload: { tag: carouselTag } })
    return NextResponse.json({ carousel, runId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await log({ step: 'text_one.error', message: `generate-text-one failed: ${message}`, level: 'error', payload: { tag: carouselTag, stack: err instanceof Error ? err.stack : null } })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
