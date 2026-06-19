import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCarousels as generateCarouselsGemini } from '@/lib/gemini-text'
import { generateCarousels as generateCarouselsClaude } from '@/lib/anthropic'
import { generateCarousels as generateCarouselsChatGPT } from '@/lib/openai-text'
import { createLogger } from '@/lib/logger'
import { resolveChoices, makeSeededRandom } from '@/lib/resolve-choices'
import { findForbiddenPatterns } from '@/lib/forbidden-patterns'
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
  gemini_api_key: string | null
  anthropic_api_key: string | null
  openai_api_key: string | null
}


import type { TemplateLayout, TextElement } from '@/types/database'

type TemplateRow = {
  master_instructions: string
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
    freezeSeed,
    pageContext,
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
    /**
     * When provided, seeds resolveChoices() deterministically so all carousels
     * in a batch share IDENTICAL resolved instructions. Also enables Anthropic
     * prompt caching (sent by the dashboard when count ≥ 4).
     */
    freezeSeed?: string
    /**
     * Summary of the pre-selected book page (pagesMode='random-first').
     * Injected into the prompt so Claude writes the title to match this page.
     */
    pageContext?: string
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
    .select('gemini_api_key, anthropic_api_key, openai_api_key')
    .eq('id', user.id)
    .single<ProfileRow>()

  const { data: template } = await supabase
    .from('templates')
    .select('master_instructions, style_guide, carousel_instructions, avatar_instructions, randomization_instructions, absolute_rules, layout')
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
  // Per-role → wordColors taken from the TextElement that owns the role.
  // Shape: { slideType: { role: [{ word, color }, ...] } }
  const wordColorsByRole: Record<string, Record<string, { word: string; color: string }[]>> = {}
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
        // Propagate element.wordColors to each role this element covers
        if (textEl.wordColors && textEl.wordColors.length > 0) {
          if (!wordColorsByRole[el.slideType]) wordColorsByRole[el.slideType] = {}
          wordColorsByRole[el.slideType][role] = textEl.wordColors.filter(wc => wc.word && wc.color)
        }
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
    // Resolve [[option1 | option2 (weight%)]] markers in all instruction fields.
    // When freezeSeed is provided, use a seeded PRNG so all N carousels in a
    // batch produce BYTE-IDENTICAL resolved text — a hard requirement for
    // Anthropic prompt caching to actually hit the cache.
    const rand = freezeSeed ? makeSeededRandom(freezeSeed) : Math.random
    const resolvedCarouselInstructions = resolveChoices(template.carousel_instructions, rand)
    const resolvedStyleGuide = resolveChoices(template.style_guide, rand)
    const resolvedMaster = template.master_instructions ? resolveChoices(template.master_instructions, rand) : undefined
    const resolvedAvatar = resolveChoices(template.avatar_instructions || '', rand)
    // randomization_instructions is injected into userPrompt (user message, not cached),
    // so it stays genuinely random even in frozen batches — no need for the seed.
    const resolvedRandomization = resolveChoices(template.randomization_instructions || '')
    await log({ step: 'text_one.randomization', message: 'randomization_instructions resolved', payload: { resolvedRandomization } })

    const absoluteRules = template.absolute_rules || ''

    await log({
      step: 'text_one.resolve_choices',
      message: 'resolved [[...]] markers in instructions',
      payload: {
        carouselChanged: resolvedCarouselInstructions !== template.carousel_instructions,
        styleChanged: resolvedStyleGuide !== template.style_guide,
        masterChanged: resolvedMaster !== template.master_instructions,
      },
    })

    // Validate that every text_field whose role has highlight enabled contains
    // EXACTLY ONE ==...== marker. Returns a list of human-readable problems.
    // Title slides are special-cased: their title field may contain >1 markers
    // ONLY if every marker is the same case-insensitive word repeated (e.g.
    // ==ADHD== appearing multiple times in the same title — the ADHD Girly
    // template demands this).
    function findHighlightProblems(slides: { index?: number; slide_type: string; text_fields: Record<string, string> }[]): string[] {
      const problems: string[] = []
      const HL = /==(.+?)==/gs
      for (const slide of slides) {
        const required = highlightRoles[slide.slide_type] ?? []
        const isTitleSlide = slide.slide_type === 'title' || slide.slide_type.startsWith('title')
        for (const role of required) {
          const value = slide.text_fields?.[role] ?? ''
          const matches = [...value.matchAll(HL)].map(m => m[1].trim())
          const loc = `slide ${slide.index ?? '?'} (${slide.slide_type}) role "${role}"`
          if (matches.length === 0) {
            problems.push(`${loc}: missing — must wrap exactly one passage in ==...==`)
            continue
          }
          if (matches.length === 1) continue
          // More than 1 marker: accept ONLY on title slide title field when every match
          // is the same word (case-insensitive) — handles "==ADHD== ... ==ADHD==" cases.
          if (isTitleSlide && role === 'title') {
            const unique = new Set(matches.map(m => m.toLowerCase()))
            if (unique.size === 1) continue
          }
          problems.push(`${loc}: has ${matches.length} highlights but must have exactly 1 (found: ${matches.map(m => `"${m}"`).join(', ')})`)
        }
      }
      return problems
    }

    const MAX_HL_ATTEMPTS = 3
    // Randomization is a FALLBACK, never an override. The user's explicit request
    // (title, topic, angle, number…) always wins; the randomized picks below only
    // fill the dimensions the user left unspecified. Without this guard, the
    // template's "MANDATORY" randomization wording overrides an explicit user title.
    const randomizationBlock = resolvedRandomization
      ? '\n\n---\nDEFAULT RANDOMIZATION — FALLBACK ONLY (lower priority than the user request above):\n'
        + 'The user request above ALWAYS takes absolute priority. If the user specified a title, topic, subject, angle, format or number, you MUST follow it exactly and IGNORE any randomized pick below that conflicts with it. Apply a randomized pick below ONLY for the dimensions the user did NOT specify.\n\n'
        + resolvedRandomization
      : ''
    const basePrompt = (userPrompt || '')
      + randomizationBlock
      + (pageContext
        ? `\n\nPAGE DE LIVRE SÉLECTIONNÉE — OBLIGATOIRE : le titre de la slide "title" DOIT s'inspirer directement du contenu de cette page. Résumé de la page :\n"${pageContext}"`
        : '')

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    let carousel: any = null
    let hlProblems: string[] = []
    let forbiddenHits: { location: string; pattern: string; snippet: string }[] = []
    for (let attempt = 1; attempt <= MAX_HL_ATTEMPTS; attempt++) {
      // On retry, prepend a strong reinforcement listing every previous failure.
      const reinforcementParts: string[] = []
      if (attempt > 1 && hlProblems.length > 0) {
        reinforcementParts.push(
          `Your previous attempt FAILED the ==...== highlight rules:\n${hlProblems.map(p => `  • ${p}`).join('\n')}\nFollow the highlight rules in the carousel instructions EXACTLY. Verify each text_field has the correct number of ==...== markers (usually exactly one) before returning.`
        )
      }
      if (attempt > 1 && forbiddenHits.length > 0) {
        reinforcementParts.push(
          `Your previous attempt USED THE FORBIDDEN OPPOSITIONAL TWO-SENTENCE STRUCTURE — this is BANNED in every language and every variant:\n${forbiddenHits.map(h => `  • ${h.location}: pattern "${h.pattern}" — snippet: "${h.snippet}"`).join('\n')}\nRewrite the offending text as a single direct affirmative sentence. NO "It's not X. It's Y.", NO "Ce n'est pas X. C'est Y.", NO variant.`
        )
      }
      const reinforcement = reinforcementParts.length > 0
        ? `CRITICAL — your previous attempt FAILED validation:\n\n${reinforcementParts.join('\n\n')}\n\nThe output is INVALID until ALL these problems are fixed.\n\n`
        : ''

      const carousels = await generateCarousels({
        apiKey,
        styleGuide: resolvedStyleGuide,
        carouselInstructions: resolvedCarouselInstructions,
        masterInstructions: resolvedMaster,
        absoluteRules,
        avatarInstructions: resolvedAvatar,
        userPrompt: reinforcement + basePrompt,
        historyBlock,
        count: 1,
        rolesByType,
        highlightRoles,
        images,
        log,
        carouselTag: attempt > 1 ? `${carouselTag}.retry${attempt - 1}` : carouselTag,
        contentSlideRange: template.layout.contentSlideRange,
        wordColorsByRole,
        // Prompt cache must stay disabled on retries (different system prompt context)
        useCache: !!freezeSeed && llm === 'claude' && attempt === 1,
      })

      carousel = Array.isArray(carousels) ? carousels[0] : carousels
      if (!carousel) {
        throw new Error('No carousel returned by LLM')
      }

      hlProblems = findHighlightProblems(carousel.slides || [])
      forbiddenHits = findForbiddenPatterns(carousel.slides || [])
      const totalProblems = hlProblems.length + forbiddenHits.length

      if (totalProblems === 0) {
        if (attempt > 1) {
          await log({ step: 'text_one.validation_recovered', message: `output recovered on attempt ${attempt}`, payload: { tag: carouselTag, attempt } })
        }
        break
      }

      await log({
        step: 'text_one.validation_failed',
        message: `attempt ${attempt}/${MAX_HL_ATTEMPTS}: ${hlProblems.length} highlight, ${forbiddenHits.length} forbidden-pattern problem(s)`,
        level: attempt === MAX_HL_ATTEMPTS ? 'warn' : 'info',
        payload: { tag: carouselTag, attempt, highlightProblems: hlProblems, forbiddenHits },
      })
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
