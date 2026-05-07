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

type GenerateArgs = {
  apiKey: string
  styleGuide: string
  carouselInstructions: string
  masterInstructions?: string
  avatarInstructions?: string
  userPrompt?: string
  historyBlock?: string
  count?: number
  model?: string
  rolesByType?: Record<string, string[]>
  log?: Logger
  carouselTag?: string
}

export async function generateCarousels({
  apiKey,
  styleGuide,
  carouselInstructions,
  masterInstructions = '',
  avatarInstructions = '',
  userPrompt = '',
  historyBlock = '',
  count = 1,
  model = 'gemini-2.5-flash',
  rolesByType,
  log,
  carouselTag = '',
}: GenerateArgs) {
  const ai = new GoogleGenAI({ apiKey })

  const masterBlock = masterInstructions
    ? `INSTRUCTIONS MASTER (priorité absolue sur le reste) :\n${masterInstructions}\n\n`
    : ''
  const avatarBlock = avatarInstructions
    ? `PROFIL AVATAR :\n${avatarInstructions}\n\n`
    : ''
  const userBlock = userPrompt ? `DEMANDE UTILISATEUR :\n${userPrompt}\n\n` : ''
  const historyBl = historyBlock ? `${historyBlock}\n\n` : ''

  const slideTypeNames = rolesByType ? Object.keys(rolesByType) : ['title', 'content', 'cta']
  const slideTypesSpec = rolesByType
    ? Object.entries(rolesByType)
        .map(([st, roles]) => {
          const rolesList = roles.length > 0 ? roles.join(', ') : '(aucun champ texte)'
          return `  - "${st}" → text_fields keys: ${rolesList}`
        })
        .join('\n')
    : '  - "title", "content", "cta" → text_fields keys: title, text, cta'

  const systemInstruction = `Tu génères du contenu pour des carousels TikTok/Instagram.

PUNCTUATION RULES — ZERO TOLERANCE:
- FORBIDDEN: em dash "—". Replace with period or line break.
- FORBIDDEN: "---" as separator.
- FORBIDDEN: "-" as punctuation or pause substitute (only inside compound words).

--- STYLE GUIDE ---
${styleGuide}

--- CAROUSEL INSTRUCTIONS ---
${carouselInstructions}

--- AVAILABLE SLIDE TYPES ---
For each slide, you must pick a slide_type from the list below. Each type has a fixed set of text roles to fill. Do NOT invent new types or new role keys.
${slideTypesSpec}

Allowed slide_type values: ${slideTypeNames.map((s) => `"${s}"`).join(', ')}.

Return ONLY a valid JSON array with exactly ${count} object(s). No markdown, no explanation, no code block — raw JSON only.

Each carousel object must have:
{
  "carousel_type": "<brief description>",
  "image_prompt_title": "<POSE/FRAMING/ANGLE only — close-up portrait, no setting, no action, no props. Strictly follow image prompt rules in carousel instructions. Must differ in pose AND hair colour from image_prompt_content.>",
  "image_prompt_content": "<Topic-related, brief, evocative — always a woman, different pose AND different hair colour from image_prompt_title. Strictly follow image prompt rules in carousel instructions.>",
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
- image_prompt_title: pose/framing/angle ONLY (no setting, no action, no props). Max 20 words.
- image_prompt_content: must relate to the carousel topic. Max 20 words.
- The two prompts MUST use different poses AND different hair colours.
- There is NO illustration_prompt on individual slides.
- All text in "text_fields" is what will be rendered on the slide.`

  const userMessage = `${masterBlock}${avatarBlock}${historyBl}${userBlock}Generate exactly ${count} carousel(s).`

  await log?.({
    step: `gemini.carousel.request${carouselTag ? '.' + carouselTag : ''}`,
    message: `generateCarousels: prompt sent to Gemini (${count} carousel(s))`,
    payload: {
      model,
      count,
      tag: carouselTag,
      systemInstruction,
      userMessage,
    },
  })

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: [{ text: userMessage }] }],
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
