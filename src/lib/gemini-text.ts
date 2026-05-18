import { GoogleGenAI } from '@google/genai'
import { jsonrepair } from 'jsonrepair'
import type { Logger } from './logger'

export type CarouselIntent = {
  count: number
  perCarousel: string[]
}

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
      if (ch < ' ') continue
    }
    result += ch
  }
  return result
}

export async function extractIntent(prompt: string, apiKey: string, log?: Logger): Promise<CarouselIntent> {
  if (!prompt?.trim()) return { count: 1, perCarousel: [prompt || ''] }

  const ai = new GoogleGenAI({ apiKey })
  const model = 'gemini-2.5-flash'

  const userContent = `You parse carousel generation requests. Read the user's message and:
1. Extract the EXACT number of carousels stated (default 1 if not stated)
2. Write a specific, UNIQUE instruction for EACH carousel — no two can overlap in topic or angle
   - Honor any explicit topic the user mentioned for specific carousels
   - For unspecified carousels, invent complementary angles from the same context
   - Keep instructions in the user's language

Return ONLY valid JSON: {"count": N, "carousels": ["instruction 1", "instruction 2", ...]}
The "carousels" array must have EXACTLY N distinct strings.

Examples:
- "3 carousels dont un sur la famille et un sur le couple" → {"count":3,"carousels":["TDAH et dynamiques familiales","TDAH et vie de couple / mariage","TDAH et gestion des émotions au quotidien"]}
- "génère 2 carousels sur le burnout" → {"count":2,"carousels":["Reconnaître les signes du burnout","Se reconstruire après un burnout"]}

User request: "${prompt.replace(/"/g, "'")}"`

  await log?.({ step: 'gemini.intent.request', message: 'extractIntent: sending prompt to Gemini', payload: { model, userPrompt: prompt } })

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: userContent }] }],
    config: { responseMimeType: 'application/json' },
  })

  const rawText = response.text ?? ''
  await log?.({ step: 'gemini.intent.response', message: 'extractIntent: raw Gemini response', payload: { raw: rawText } })

  try {
    const cleaned = rawText.trim().replace(/```json|```/g, '').trim()
    const parsed = JSON.parse(jsonrepair(sanitizeJsonStrings(cleaned)))
    const count = Math.max(1, Math.min(10, parseInt(parsed.count) || 1))
    const carousels: string[] = Array.isArray(parsed.carousels)
      ? parsed.carousels.slice(0, count).map((x: unknown) => String(x || '').trim()).filter(Boolean)
      : []
    while (carousels.length < count) carousels.push(prompt)
    await log?.({ step: 'gemini.intent.parsed', message: `intent: ${count} carousel(s)`, payload: { count, perCarousel: carousels } })
    return { count, perCarousel: carousels }
  } catch (err) {
    await log?.({ step: 'gemini.intent.parsed', message: 'intent parse failed, falling back to count=1', level: 'warn', payload: { error: err instanceof Error ? err.message : String(err) } })
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
  rolesByType?: Record<string, string[]>
  highlightRoles?: Record<string, string[]>
  images?: ImageInput[]
  log?: Logger
  carouselTag?: string
  // Min/max number of "content" slides the LLM must generate
  contentSlideRange?: { min: number; max: number }
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

  const lines = slideTypes.map(st => {
    if (isContent(st)) {
      return `  - "${st}": between ${range.min} and ${range.max} slides (pick a random count within this range)`
    }
    return `  - "${st}": exactly 1 slide`
  })

  const fixedCount = slideTypes.filter(st => !isContent(st)).length
  const minTotal = fixedCount + range.min
  const maxTotal = fixedCount + range.max

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
  model = 'gemini-2.5-flash',
  rolesByType,
  highlightRoles = {},
  images = [],
  log,
  carouselTag = '',
  contentSlideRange,
}: GenerateArgs) {
  const ai = new GoogleGenAI({ apiKey })

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

  const slideTypeNames = rolesByType ? Object.keys(rolesByType) : ['title', 'content', 'cta']
  const slideStructureBlock = buildSlideStructureBlock(slideTypeNames, contentSlideRange)
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

  const slideStructurePart = slideStructureBlock ? `\n\n${slideStructureBlock}` : ''
  const systemInstruction = `You generate content for TikTok/Instagram carousels.

WRITING RULES — ZERO TOLERANCE:
- FORBIDDEN: em dash "—". Replace with period or line break.
- FORBIDDEN: "---" as separator.
- FORBIDDEN: "-" as punctuation or pause substitute (only inside compound words).
- FORBIDDEN: the "It wasn't X. It was Y." construction and ALL its variants ("It's not X. It's Y.", "Ce n'est pas X. C'est Y.", "Pas X. Juste Y.", "Not X. Y.", etc.). Never use this oppositional two-sentence structure. Find a direct, affirmative formulation instead.
- NUMBER CONSISTENCY: If the title text contains a specific count (e.g. "4 choses", "7 signes"), the number of content slides MUST exactly equal that number — it overrides the range in the slide structure below.
- EXACT TITLE: If the USER REQUEST specifies an exact title (e.g. "titre : X", "avec le titre X", or simply states a title directly), reproduce it VERBATIM in the title slide's text_field — zero modifications, zero paraphrasing. The user's wording is sacred.${slideStructurePart}

--- STYLE GUIDE ---
${styleGuide}

--- CAROUSEL INSTRUCTIONS ---
${carouselInstructions}

--- AVAILABLE SLIDE TYPES ---
For each slide, you must pick a slide_type from the list below. Each type has a fixed set of text roles to fill. Do NOT invent new types or new role keys.
${slideTypesSpec}

HIGHLIGHT RULES — MANDATORY, NO EXCEPTIONS:
- For every text role marked [HIGHLIGHT ENABLED], you MUST include ==...== markers in the text.
- Every such field MUST contain at least one ==highlighted passage==.
- If a field is marked [HIGHLIGHT ENABLED] and you produce text without any ==...== markers, the output is INVALID.
- Choose the 1 to 3 most emotionally resonant words or short phrases and wrap them: ==like this==.

Allowed slide_type values: ${slideTypeNames.map((s) => `"${s}"`).join(', ')}.

Return ONLY a valid JSON array with exactly ${count} object(s). No markdown, no explanation, no code block — raw JSON only.

Each carousel object must have:
{
  "carousel_type": "<brief description>",
  "image_prompt_title": "<Illustration prompt for the TITLE slide. Follow STRICTLY the image prompt rules defined in the carousel instructions above. Do NOT invent framing, background, or composition rules — only what the template says.>",
  "image_prompt_content": "<Illustration prompt for the CONTENT slides. Follow STRICTLY the image prompt rules defined in the carousel instructions above. Do NOT invent framing, background, or composition rules — only what the template says.>",
  "slides": [
    {
      "index": 1,
      "slide_type": "<one of the allowed values above>",
      "text_fields": { "<role>": "<copy>", ... }
    },
    ...
  ]
}

IMPORTANT:
- "text_fields" keys MUST exactly match the roles listed for the chosen slide_type.
- "image_prompt_title" and "image_prompt_content" MUST always be filled in. NEVER leave them empty.
- image_prompt_title and image_prompt_content: follow ONLY the framing, composition, and background rules defined in the template's carousel instructions. Do NOT add hardcoded defaults. Max 20 words each.
- There is NO illustration_prompt on individual slides.
- All text in "text_fields" is what will be rendered on the slide.`

  const userMessage = `${masterBlock}${absoluteRulesBlock}${avatarBlock}${historyBl}${userBlock}Generate exactly ${count} carousel(s).`

  const imageParts = images.map(img => ({
    inlineData: { mimeType: img.mimeType, data: img.base64 },
  }))
  const imagesNote = images.length > 0
    ? `\n\nREFERENCE IMAGES: ${images.length} image(s) attached. Extract or adapt text from them as instructed by the user.`
    : ''

  await log?.({
    step: `gemini.carousel.request${carouselTag ? '.' + carouselTag : ''}`,
    message: `generateCarousels: prompt sent to Gemini (${count} carousel(s), ${images.length} image(s))`,
    payload: {
      model,
      count,
      tag: carouselTag,
      imageCount: images.length,
      systemInstruction,
      userMessage,
    },
  })

  const response = await ai.models.generateContent({
    model,
    contents: [{
      role: 'user',
      parts: [
        ...imageParts,
        { text: userMessage + imagesNote },
      ],
    }],
    config: {
      systemInstruction,
      responseMimeType: 'application/json',
    },
  })

  const raw = response.text?.trim() ?? ''
  await log?.({
    step: `gemini.carousel.response${carouselTag ? '.' + carouselTag : ''}`,
    message: 'generateCarousels: raw Gemini response',
    payload: { raw },
  })

  const match = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const jsonText = match ? match[1] : raw
  const parsed = JSON.parse(jsonrepair(sanitizeJsonStrings(jsonText)))
  await log?.({
    step: `gemini.carousel.parsed${carouselTag ? '.' + carouselTag : ''}`,
    message: 'generateCarousels: parsed JSON',
    payload: { parsed },
  })
  return parsed
}
