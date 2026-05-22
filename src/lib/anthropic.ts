import Anthropic from '@anthropic-ai/sdk'
import type { Logger } from './logger'

/**
 * Retry a Claude API call with exponential backoff when Anthropic returns
 * transient errors:
 *   - 429: rate limited
 *   - 529: overloaded (Anthropic's servers are saturated)
 *   - 503: service unavailable
 *   - 500: generic upstream error
 *
 * Delays: 1s → 2s → 4s → 8s → 16s (then give up).
 * Total worst-case wait before final failure: ~31s.
 */
async function withRetry<T>(
  fn: () => Promise<T>,
  log?: Logger,
  tag = ''
): Promise<T> {
  const RETRYABLE = new Set([429, 500, 503, 529])
  const MAX_ATTEMPTS = 5
  let lastErr: unknown

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    try {
      return await fn()
    } catch (err: unknown) {
      lastErr = err
      const status =
        typeof err === 'object' && err !== null && 'status' in err
          ? Number((err as { status: number }).status)
          : 0
      if (!RETRYABLE.has(status) || attempt === MAX_ATTEMPTS) {
        throw err
      }
      const delayMs = Math.pow(2, attempt - 1) * 1000 // 1s, 2s, 4s, 8s, 16s
      const jitter = Math.floor(Math.random() * 250)
      const wait = delayMs + jitter
      await log?.({
        step: `claude.retry${tag ? '.' + tag : ''}`,
        level: 'warn',
        message: `Anthropic returned ${status}, retrying in ${wait}ms (attempt ${attempt}/${MAX_ATTEMPTS - 1})`,
        payload: { status, attempt, waitMs: wait },
      })
      await new Promise((resolve) => setTimeout(resolve, wait))
    }
  }
  throw lastErr
}

export type CarouselIntent = {
  count: number
  // One specific, distinct instruction per carousel (never null)
  perCarousel: string[]
}

/**
 * Escape literal control characters (newline, carriage-return, tab, etc.)
 * that appear INSIDE JSON string values — not in structural whitespace.
 *
 * Claude occasionally emits raw \n / \t inside "text_fields" copy when
 * generating large batches, which makes JSON.parse throw
 * "Bad control character in string literal".
 */
function sanitizeJsonStrings(text: string): string {
  let inString = false
  let escaped = false
  let result = ''
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]
    if (escaped) { escaped = false; result += ch; continue }
    if (ch === '\\' && inString) { escaped = true; result += ch; continue }
    if (ch === '"') { inString = !inString; result += ch; continue }
    if (inString) {
      if (ch === '\n') { result += '\\n'; continue }
      if (ch === '\r') { result += '\\r'; continue }
      if (ch === '\t') { result += '\\t'; continue }
      if (ch < ' ') continue // strip other ASCII control chars
    }
    result += ch
  }
  return result
}

export async function extractIntent(prompt: string, apiKey: string, log?: Logger): Promise<CarouselIntent> {
  if (!prompt?.trim()) return { count: 1, perCarousel: [prompt || ''] }

  const client = new Anthropic({ apiKey })
  const userContent = `You parse carousel generation requests. Read the user's message and:\n1. Extract the EXACT number of carousels stated (default 1 if not stated)\n2. Write a specific, UNIQUE instruction for EACH carousel — no two can overlap in topic or angle\n   - Honor any explicit topic the user mentioned for specific carousels\n   - For unspecified carousels, invent complementary angles from the same context\n   - Keep instructions in the user's language\n\nReturn ONLY valid JSON: {"count": N, "carousels": ["instruction 1", "instruction 2", ...]}\nThe "carousels" array must have EXACTLY N distinct strings.\n\nIMPORTANT: Do NOT invent a topic. If the user did not specify a topic, leave the instructions topic-neutral and rely entirely on the template's own instructions to set the subject matter. Never inject a topic from these examples into your output.\n\nExamples (format only — do NOT copy the topics):\n- "3 carrousels dont un sur le thème A et un sur le thème B" → {"count":3,"carousels":["<thème A>","<thème B>","<angle complémentaire>"]}\n- "génère 2 carrousels" → {"count":2,"carousels":["carrousel 1","carrousel 2"]}\n\nUser request: "${prompt.replace(/"/g, "'")}"`

  await log?.({ step: 'claude.intent.request', message: 'extractIntent: sending prompt to Claude', payload: { model: 'claude-haiku-4-5', userPrompt: prompt, fullClaudePrompt: userContent } })

  const res = await withRetry(
    () =>
      client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 512,
        messages: [{ role: 'user', content: userContent }],
      }),
    log,
    'intent'
  )

  const rawText = res.content[0].type === 'text' ? res.content[0].text : ''
  await log?.({ step: 'claude.intent.response', message: 'extractIntent: raw Claude response', payload: { raw: rawText } })

  try {
    const text = rawText.trim()
    const cleaned = text.replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(sanitizeJsonStrings(cleaned))
    const count = Math.max(1, Math.min(10, parseInt(parsed.count) || 1))
    const carousels: string[] = Array.isArray(parsed.carousels)
      ? parsed.carousels.slice(0, count).map((x: unknown) => String(x || '').trim()).filter(Boolean)
      : []
    while (carousels.length < count) carousels.push(prompt)
    await log?.({ step: 'claude.intent.parsed', message: `intent: ${count} carousel(s)`, payload: { count, perCarousel: carousels } })
    return { count, perCarousel: carousels }
  } catch (err) {
    await log?.({ step: 'claude.intent.parsed', message: 'intent parse failed, falling back to count=1', level: 'warn', payload: { error: err instanceof Error ? err.message : String(err) } })
    return { count: 1, perCarousel: [prompt] }
  }
}

export type ImageInput = {
  base64: string
  mimeType: string
}

type GenerateArgs = {
  apiKey: string
  styleGuide: string
  carouselInstructions: string
  masterInstructions?: string
  absoluteRules?: string
  avatarInstructions?: string
  userPrompt?: string
  historyBlock?: string
  count?: number
  model?: string
  // Map of slide type → list of text roles (e.g., { title: ['title'], content: ['title', 'text'], cta: ['title', 'text', 'cta'] })
  rolesByType?: Record<string, string[]>
  highlightRoles?: Record<string, string[]>
  images?: ImageInput[]
  log?: Logger
  carouselTag?: string
  // Min/max number of "content" slides the LLM must generate
  contentSlideRange?: { min: number; max: number }
  // When true, enable Anthropic prompt caching on the system block.
  // Only meaningful when the same system block is sent ≥2 times within 5 min.
  // The route is responsible for ensuring the system block is byte-identical
  // across calls (i.e. resolveChoices must be frozen via seed).
  useCache?: boolean
}

/**
 * Build a MANDATORY SLIDE STRUCTURE block for the LLM prompt.
 * Slide types containing "content" get a variable count; all others get exactly 1.
 */
function buildSlideStructureBlock(
  slideTypes: string[],
  contentSlideRange?: { min: number; max: number }
): string {
  if (!slideTypes.length) return ''
  const range = contentSlideRange ?? { min: 5, max: 8 }
  const isContent = (st: string) => st === 'content' || st.startsWith('content')
  const hasContentType = slideTypes.some(isContent)

  const lines = slideTypes.map(st => {
    if (isContent(st)) {
      return `  - "${st}": between ${range.min} and ${range.max} slides (pick a random count within this range)`
    }
    return `  - "${st}": exactly 1 slide`
  })

  // If no slide type uses the "content*" naming convention, every type is fixed at 1.
  // Don't inflate the total with the default range — that would contradict the "exactly 1" per-type lines.
  const fixedCount = slideTypes.filter(st => !isContent(st)).length
  const minTotal = hasContentType ? fixedCount + range.min : slideTypes.length
  const maxTotal = hasContentType ? fixedCount + range.max : slideTypes.length

  return `MANDATORY SLIDE STRUCTURE — enforce this AFTER master instructions, BEFORE style guide:
Generate slides in this ORDER with these EXACT COUNTS:
${lines.join('\n')}
Total: ${minTotal === maxTotal ? minTotal : `${minTotal}–${maxTotal}`} slides.
Do NOT skip any type. Do NOT change the order. Do NOT add extra slides of fixed types.`
}

export async function generateCarousels({
  apiKey,
  styleGuide,
  carouselInstructions,
  masterInstructions = '',
  absoluteRules = '',
  avatarInstructions = '',
  userPrompt = '',
  historyBlock = '',
  count = 1,
  model = 'claude-haiku-4-5',
  rolesByType,
  highlightRoles = {},
  images = [],
  log,
  carouselTag = '',
  contentSlideRange,
  useCache = false,
}: GenerateArgs) {
  const client = new Anthropic({ apiKey })

  const masterBlock = masterInstructions
    ? `MASTER INSTRUCTIONS (absolute priority over all other instructions):\n${masterInstructions}\n\n`
    : ''
  const absoluteRulesBlock = absoluteRules
    ? `MANDATORY RULES (highest priority after master instructions — can never be violated):\n${absoluteRules}\n\n`
    : ''
  const avatarBlock = avatarInstructions
    ? `AVATAR PROFILE:\n${avatarInstructions}\n\n`
    : ''
  const userBlock = userPrompt ? `USER OVERRIDES — ABSOLUTE PRIORITY (these instructions override all template instructions below — enforce them literally and programmatically):\n${userPrompt}\n\n` : ''
  const historyBl = historyBlock ? `${historyBlock}\n\n` : ''

  // Build the slide-types specification block from the template layout.
  // Each slide type lists the text roles Claude must fill in for that type.
  const slideTypeNames = rolesByType ? Object.keys(rolesByType) : ['title', 'content', 'cta']
  const slideStructureBlock = buildSlideStructureBlock(slideTypeNames, contentSlideRange)
  const slideTypesSpec = rolesByType
    ? Object.entries(rolesByType)
        .map(([st, roles]) => {
          const rolesList = roles.length > 0 ? roles.join(', ') : '(no text fields)'
          const hlRoles = highlightRoles[st] ?? []
          const hlNote = hlRoles.length > 0
            ? `\n    [HIGHLIGHT ENABLED for: ${hlRoles.map(r => `"${r}"`).join(', ')} — wrap 1–3 emotionally charged words/phrases in ==...== markers, e.g. "==a few words== to emphasize"]`
            : ''
          return `  - "${st}" → text_fields keys: ${rolesList}${hlNote}`
        })
        .join('\n')
    : '  - "title", "content", "cta" → text_fields keys: title, text, cta'

  const slideStructurePart = slideStructureBlock ? `\n\n${slideStructureBlock}` : ''

  // ── SYSTEM prompt (cacheable when useCache=true) ──────────────────────
  // Contains ONLY static, batch-invariant content: template instructions,
  // writing rules, schema. No userPrompt, no historyBlock, no count.
  const systemPrompt = `${masterBlock}${absoluteRulesBlock}${avatarBlock}You generate content for TikTok/Instagram carousels.\n\nWRITING RULES — ZERO TOLERANCE:\n- FORBIDDEN: em dash "—". Replace with period or line break.\n- FORBIDDEN: "---" as separator.\n- FORBIDDEN: "-" as punctuation or pause substitute (only inside compound words).\n- FORBIDDEN: the "It wasn't X. It was Y." construction and ALL its variants. Never use this oppositional two-sentence structure.\n- NUMBER CONSISTENCY: If the title text contains a specific count (e.g. "4 choses", "7 signes"), the number of content slides MUST exactly equal that number — it overrides the range in the slide structure below.${slideStructurePart}\n\n--- STYLE GUIDE ---\n${styleGuide}\n\n--- CAROUSEL INSTRUCTIONS ---\n${carouselInstructions}\n\n--- AVAILABLE SLIDE TYPES ---\nFor each slide, you must pick a slide_type from the list below. Each type has a fixed set of text roles to fill. Do NOT invent new types or new role keys.\n${slideTypesSpec}\n\nHIGHLIGHT RULES — MANDATORY, NO EXCEPTIONS:\n- For every text role marked [HIGHLIGHT ENABLED], you MUST include ==...== markers in the text.\n- Every such field MUST contain at least one ==highlighted passage==.\n- If a field is marked [HIGHLIGHT ENABLED] and you produce text without any ==...== markers, the output is INVALID.\n- Choose the 1 to 3 most emotionally resonant words or short phrases and wrap them: ==like this==.\n\nAllowed slide_type values: ${slideTypeNames.map((s) => `"${s}"`).join(', ')}.\n\nReturn ONLY a valid JSON array. No markdown, no explanation, no code block — raw JSON only.\n\nEach carousel object must have:\n{\n  "carousel_type": "<brief description>",\n  "image_prompt_title": "<Illustration prompt for the TITLE slide. Follow STRICTLY the image prompt rules defined in the carousel instructions above. Do NOT invent framing, background, or composition rules — only what the template says.>",\n  "image_prompt_content": "<Illustration prompt for the CONTENT slides. Follow STRICTLY the image prompt rules defined in the carousel instructions above. Do NOT invent framing, background, or composition rules — only what the template says.>",\n  "slides": [\n    {\n      "index": 1,\n      "slide_type": "<one of the allowed values above>",\n      "text_fields": { "<role>": "<copy>", ... }\n    },\n    ...\n  ]\n}\n\nIMPORTANT:\n- "text_fields" keys MUST exactly match the roles listed for the chosen slide_type.\n- "image_prompt_title" and "image_prompt_content" MUST always be filled in. NEVER leave them empty.\n- image_prompt_title and image_prompt_content: follow ONLY the framing, composition, and background rules defined in the template's carousel instructions. Do NOT add hardcoded defaults. Max 20 words each.\n- There is NO illustration_prompt on individual slides.\n- All text in "text_fields" is what will be rendered on the slide.`

  const imagesNote = images.length > 0
    ? `\n\nREFERENCE IMAGES: ${images.length} image(s) attached. Extract or adapt text from them as instructed by the user.`
    : ''

  // ── USER message (per-call, not cached) ───────────────────────────────
  // Contains only the dynamic per-carousel bits: history, user override,
  // count. Images go here too (they're per-carousel).
  const userText = `${historyBl}${userBlock}Generate exactly ${count} carousel(s) following the system instructions above.${imagesNote}`

  type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: MediaType; data: string } }
  type TextBlock = { type: 'text'; text: string }
  const imageBlocks: ImageBlock[] = images.map(img => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: img.mimeType as MediaType, data: img.base64 },
  }))
  const messageContent: (ImageBlock | TextBlock)[] = [
    ...imageBlocks,
    { type: 'text' as const, text: userText },
  ]

  await log?.({
    step: `claude.carousel.request${carouselTag ? '.' + carouselTag : ''}`,
    message: `generateCarousels: full prompt sent to Claude (${count} carousel(s), ${images.length} image(s), cache=${useCache})`,
    payload: {
      model,
      count,
      tag: carouselTag,
      imageCount: images.length,
      useCache,
      blocks: {
        masterInstructions,
        avatarInstructions,
        styleGuide,
        carouselInstructions,
        historyBlock,
        userPrompt,
        slideTypesSpec,
      },
      systemPrompt,
      userText,
    },
  })

  // cache_control is supported at runtime but the installed SDK's types may
  // not include it on TextBlockParam yet — cast through to satisfy the compiler.
  const systemParam = useCache
    ? ([{ type: 'text', text: systemPrompt, cache_control: { type: 'ephemeral' } }] as unknown as string)
    : systemPrompt
  const message = await withRetry(
    () =>
      client.messages.create({
        model,
        max_tokens: 4096,
        system: systemParam,
        messages: [{ role: 'user', content: messageContent }],
      }),
    log,
    `carousel${carouselTag ? '.' + carouselTag : ''}`
  )

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const usage = message.usage as any
  const cacheWrite = usage?.cache_creation_input_tokens ?? 0
  const cacheRead = usage?.cache_read_input_tokens ?? 0
  await log?.({
    step: `claude.carousel.response${carouselTag ? '.' + carouselTag : ''}`,
    message: `generateCarousels: response (cacheWrite=${cacheWrite}, cacheRead=${cacheRead})`,
    payload: { raw, usage },
  })

  const match = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const jsonText = match ? match[1] : raw
  const parsed = JSON.parse(sanitizeJsonStrings(jsonText))
  await log?.({
    step: `claude.carousel.parsed${carouselTag ? '.' + carouselTag : ''}`,
    message: 'generateCarousels: parsed JSON',
    payload: { parsed },
  })
  return parsed
}
