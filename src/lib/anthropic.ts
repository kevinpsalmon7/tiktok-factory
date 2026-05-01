import Anthropic from '@anthropic-ai/sdk'

type GenerateArgs = {
  apiKey: string
  styleGuide: string
  carouselInstructions: string
  masterInstructions?: string
  avatarInstructions?: string
  userPrompt?: string
  count?: number
  model?: string
}

export async function generateCarousels({
  apiKey,
  styleGuide,
  carouselInstructions,
  masterInstructions = '',
  avatarInstructions = '',
  userPrompt = '',
  count = 1,
  model = 'claude-haiku-4-5-20251001',
}: GenerateArgs) {
  const client = new Anthropic({ apiKey })

  const masterBlock = masterInstructions
    ? `INSTRUCTIONS MASTER (priorité absolue sur le reste) :\n${masterInstructions}\n\n`
    : ''
  const avatarBlock = avatarInstructions
    ? `PROFIL AVATAR :\n${avatarInstructions}\n\n`
    : ''
  const userBlock = userPrompt ? `DEMANDE UTILISATEUR :\n${userPrompt}\n\n` : ''

  const prompt = `${masterBlock}${avatarBlock}${userBlock}Tu génères du contenu pour des carousels TikTok/Instagram.

PUNCTUATION RULES — ZERO TOLERANCE:
- FORBIDDEN: em dash "—". Replace with period or line break.
- FORBIDDEN: "---" as separator.
- FORBIDDEN: "-" as punctuation or pause substitute (only inside compound words).

Generate exactly ${count} carousel(s). Each must follow the style and structure below.

--- STYLE GUIDE ---
${styleGuide}

--- CAROUSEL INSTRUCTIONS ---
${carouselInstructions}

Return ONLY a valid JSON array with exactly ${count} object(s). No markdown, no explanation, no code block — raw JSON only.

Each carousel object must have:
{
  "carousel_type": "<brief description>",
  "slides": [
    {
      "index": 1,
      "slide_type": "title" | "content" | "cta",
      "text_fields": { "heading_text": "...", "body_text": "...", "keyword_text": "..." },
      "illustration_prompt": "<short vivid description for the background image>"
    },
    ...
  ]
}

IMPORTANT:
- The "illustration_prompt" is used for generating the background image (Gemini). It must NEVER appear in the final visible text.
- All text in "text_fields" is what will be rendered on the slide.
`

  const message = await client.messages.create({
    model,
    max_tokens: 4096,
    messages: [{ role: 'user', content: prompt }],
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  const match = raw.match(/```(?:json)?\s*([\s\S]+?)\s*```/)
  const jsonText = match ? match[1] : raw
  return JSON.parse(jsonText)
}
