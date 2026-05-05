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
  // Map of slide type → list of text roles (e.g., { title: ['title'], content: ['title', 'text'], cta: ['title', 'text', 'cta'] })
  rolesByType?: Record<string, string[]>
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
  rolesByType,
}: GenerateArgs) {
  const client = new Anthropic({ apiKey })

  const masterBlock = masterInstructions
    ? `INSTRUCTIONS MASTER (priorité absolue sur le reste) :\n${masterInstructions}\n\n`
    : ''
  const avatarBlock = avatarInstructions
    ? `PROFIL AVATAR :\n${avatarInstructions}\n\n`
    : ''
  const userBlock = userPrompt ? `DEMANDE UTILISATEUR :\n${userPrompt}\n\n` : ''

  // Build the slide-types specification block from the template layout.
  // Each slide type lists the text roles Claude must fill in for that type.
  const slideTypeNames = rolesByType ? Object.keys(rolesByType) : ['title', 'content', 'cta']
  const slideTypesSpec = rolesByType
    ? Object.entries(rolesByType)
        .map(([st, roles]) => {
          const rolesList = roles.length > 0 ? roles.join(', ') : '(aucun champ texte)'
          return `  - "${st}" → text_fields keys: ${rolesList}`
        })
        .join('\n')
    : '  - "title", "content", "cta" → text_fields keys: title, text, cta'

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

--- AVAILABLE SLIDE TYPES ---
For each slide, you must pick a slide_type from the list below. Each type has a fixed set of text roles to fill. Do NOT invent new types or new role keys.
${slideTypesSpec}

Allowed slide_type values: ${slideTypeNames.map((s) => `"${s}"`).join(', ')}.

Return ONLY a valid JSON array with exactly ${count} object(s). No markdown, no explanation, no code block — raw JSON only.

Each carousel object must have:
{
  "carousel_type": "<brief description>",
  "image_prompt_title": "<background image prompt for slide 1 — see carousel instructions>",
  "image_prompt_content": "<background image prompt shared by all other slides — see carousel instructions>",
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
- "image_prompt_title" and "image_prompt_content" MUST always be filled in. NEVER leave them empty. Follow the image prompt rules in the carousel instructions.
- There is NO illustration_prompt on individual slides.
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
