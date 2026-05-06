import { GoogleGenAI } from '@google/genai'

type ReferenceImage = {
  data: Buffer
  mimeType: string
}

export type SlideType = 'title' | 'content' | 'cta' | string

type GenerateImageArgs = {
  apiKey: string
  styleInstructions: string
  illustrationPrompt: string
  referenceImages?: ReferenceImage[]
  slideType?: SlideType
  model?: string
}

/**
 * Slide-type composition rules. Appended to the system instruction so they
 * carry the same authority as the user's main style guide.
 */
function compositionRulesForSlide(slideType?: SlideType): string {
  switch (slideType) {
    case 'title':
      return `\n\n## CURRENT SLIDE — TITLE\nFraming: tight close-up. Face only or face and shoulders only. The figure occupies the dominant portion of the frame. No full body. No wide shot. No environmental storytelling.`
    case 'content':
      return `\n\n## CURRENT SLIDE — CONTENT\nComposition: abstract, atmospheric figure. Quiet, simplified, almost timeless backdrop. No narrative scene with multiple props or specific situations being lived out. A figure and a mood, nothing more.`
    case 'cta':
      return `\n\n## CURRENT SLIDE — CTA\nComposition: same abstract atmospheric rules as content slides. Clean, simple, no narrative.`
    default:
      return ''
  }
}

/**
 * Calls Gemini image generation following the same architecture as a Gemini
 * Gem (custom assistant):
 *
 *   - systemInstruction = the user's style guide + slide-type composition
 *     rules. This is what gives the style guide high authority, exactly like
 *     the "Instructions" field of a Gem.
 *   - User content = reference images + the raw scene prompt. Minimal, no
 *     meta-fences, no wrapping text — the same payload pattern that works
 *     when chatting with a Gem.
 *
 * Earlier versions piled everything into a single user message, which
 * diluted the style guide to user-level authority and let the visual
 * conditioning of the references dominate the output.
 */
export async function generateImage({
  apiKey,
  styleInstructions,
  illustrationPrompt,
  referenceImages = [],
  slideType,
  model = 'gemini-2.5-flash-image',
}: GenerateImageArgs): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey })

  // System instruction = persona / style guide. Same role as a Gem's
  // "Instructions" field.
  const systemInstructionText = `${styleInstructions}${compositionRulesForSlide(slideType)}`

  // User content = references + raw prompt. Minimal payload.
  const userParts: Array<
    | { inlineData: { data: string; mimeType: string } }
    | { text: string }
  > = []

  for (const img of referenceImages) {
    userParts.push({
      inlineData: {
        data: img.data.toString('base64'),
        mimeType: img.mimeType,
      },
    })
  }

  userParts.push({ text: illustrationPrompt })

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: userParts }],
    config: {
      responseModalities: ['IMAGE'],
      systemInstruction: systemInstructionText,
    },
  })

  // Find the image part in the response
  const candidates = response.candidates || []
  for (const candidate of candidates) {
    const candidateParts = candidate.content?.parts || []
    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64')
      }
    }
  }

  throw new Error('Gemini returned no image data')
}
