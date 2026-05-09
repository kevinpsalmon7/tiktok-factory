import Anthropic from '@anthropic-ai/sdk'
import type { Logger } from './logger'

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
  const userContent = `You parse carousel generation requests. Read the user's message and:\n1. Extract the EXACT number of carousels stated (default 1 if not stated)\n2. Write a specific, UNIQUE instruction for EACH carousel — no two can overlap in topic or angle\n   - Honor any explicit topic the user mentioned for specific carousels\n   - For unspecified carousels, invent complementary angles from the same context\n   - Keep instructions in the user's language\n\nReturn ONLY valid JSON: {"count": N, "carousels": ["instruction 1", "instruction 2", ...]}\nThe "carousels" array must have EXACTLY N distinct strings.\n\nExamples:\n- "3 carousels dont un sur la famille et un sur le couple" → {"count":3,"carousels":["TDAH et dynamiques familiales","TDAH et vie de couple / mariage","TDAH et gestion des émotions au quotidien"]}\n- "génère 2 carousels sur le burnout" → {"count":2,"carousels":["Reconnaître les signes du burnout","Se reconstruire après un burnout"]}\n\nUser request: "${prompt.replace(/"/g, "'")}"`

  await log?.({ step: 'claude.intent.request', message: 'extractIntent: sending prompt to Claude', payload: { model: 'claude-sonnet-4-5', userPrompt: prompt, fullClaudePrompt: userContent } })

  const res = await client.messages.create({
    model: 'claude-sonnet-4-5',
    max_tokens: 512,
    messages: [{ role: 'user', content: userContent }],
  })

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
  model = 'claude-sonnet-4-5',
  rolesByType,
  highlightRoles = {},
  images = [],
  log,
  carouselTag = '',
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
  const userBlock = userPrompt ? `USER REQUEST:\n${userPrompt}\n\n` : ''
  const historyBl = historyBlock ? `${historyBlock}\n\n` : ''

  // Build the slide-types specification block from the template layout.
  // Each slide type lists the text roles Claude must fill in for that type.
  const slideTypeNames = rolesByType ? Object.keys(rolesByType) : ['title', 'content', 'cta']
  const slideTypesSpec = rolesByType
    ? Object.entries(rolesByType)
        .map(([st, roles]) => {
          const rolesList = roles.length > 0 ? roles.join(', ') : '(no text fields)'
          const hlRoles = highlightRoles[st] ?? []
          const hlNote = hlRoles.length > 0
            ? `\n    [HIGHLIGHT ENABLED for: ${hlRoles.map(r => `"${r}"`).join(', ')} — wrap 1–3 emotionally charged words/phrases in ==...== markers, e.g. "The ==ADHD Tax== hits hardest"]`
            : ''
          return `  - "${st}" → text_fields keys: ${rolesList}${hlNote}`
        })
        .join('\n')
    : '  - "title", "content", "cta" → text_fields keys: title, text, cta'

  const prompt = `${masterBlock}${absoluteRulesBlock}${avatarBlock}${historyBl}${userBlock}You generate content for TikTok/Instagram carousels.\n\nWRITING RULES — ZERO TOLERANCE:\n- FORBIDDEN: em dash "—". Replace with period or line break.\n- FORBIDDEN: "---" as separator.\n- FORBIDDEN: "-" as punctuation or pause substitute (only inside compound words).\n- FORBIDDEN: the "It wasn't X. It was Y." construction and ALL its variants ("It's not X. It's Y.", "Ce n'est pas X. C'est Y.", "Pas X. Juste Y.", "Not X. Y.", etc.). Never use this oppositional two-sentence structure. Find a direct, affirmative formulation instead.\n\nGenerate exactly ${count} carousel(s). Each must follow the style and structure below.\n\n--- STYLE GUIDE ---\n${styleGuide}\n\n--- CAROUSEL INSTRUCTIONS ---\n${carouselInstructions}\n\n--- AVAILABLE SLIDE TYPES ---\nFor each slide, you must pick a slide_type from the list below. Each type has a fixed set of text roles to fill. Do NOT invent new types or new role keys.\n${slideTypesSpec}\n\nAllowed slide_type values: ${slideTypeNames.map((s) => `"${s}"`).join(', ')}.\n\nReturn ONLY a valid JSON array with exactly ${count} object(s). No markdown, no explanation, no code block — raw JSON only.\n\nEach carousel object must have:\n{\n  "carousel_type": "<brief description>",\n  "image_prompt_title": "<POSE/FRAMING/ANGLE only — close-up portrait, no setting, no action, no props. Strictly follow image prompt rules in carousel instructions. Must differ in pose AND hair colour from image_prompt_content.>",\n  "image_prompt_content": "<Topic-related, brief, evocative — always a woman, different pose AND different hair colour from image_prompt_title. Strictly follow image prompt rules in carousel instructions.>",\n  "slides": [\n    {\n      "index": 1,\n      "slide_type": "<one of the allowed values above>",\n      "text_fields": { "<role>": "<copy>", ... }\n    },\n    ...\n  ]\n}\n\nIMPORTANT:\n- "text_fields" keys MUST exactly match the roles listed for the chosen slide_type.\n- "image_prompt_title" and "image_prompt_content" MUST always be filled in. NEVER leave them empty.\n- image_prompt_title: pose/framing/angle ONLY (no setting, no action, no props). Max 20 words.\n- image_prompt_content: must relate to the carousel topic. Max 20 words.\n- The two prompts MUST use different poses AND different hair colours.\n- There is NO illustration_prompt on individual slides.\n- All text in "text_fields" is what will be rendered on the slide.\n`

  const imagesNote = images.length > 0
    ? `\n\nREFERENCE IMAGES: ${images.length} image(s) attached. Extract or adapt text from them as instructed by the user.`
    : ''

  type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
  type ImageBlock = { type: 'image'; source: { type: 'base64'; media_type: MediaType; data: string } }
  type TextBlock = { type: 'text'; text: string }
  const imageBlocks: ImageBlock[] = images.map(img => ({
    type: 'image' as const,
    source: { type: 'base64' as const, media_type: img.mimeType as MediaType, data: img.base64 },
  }))
  const messageContent: (ImageBlock | TextBlock)[] = [
    ...imageBlocks,
    { type: 'text' as const, text: prompt + imagesNote },
  ]

  await log?.({
    step: `claude.carousel.request${carouselTag ? '.' + carouselTag : ''}`,
    message: `generateCarousels: full prompt sent to Claude (${count} carousel(s), ${images.length} image(s))`,
    payload: {
      model,
      count,
      tag: carouselTag,
      imageCount: images.length,
      blocks: {
        masterInstructions,
        avatarInstructions,
        styleGuide,
        carouselInstructions,
        historyBlock,
        userPrompt,
        slideTypesSpec,
      },
      fullClaudePrompt: prompt,
    },
  })

  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: messageContent }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  await log?.({
    step: `claude.carousel.response${carouselTag ? '.' + carouselTag : ''}`,
    message: 'generateCarousels: raw Claude response',
    payload: { raw, usage: message.usage },
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
