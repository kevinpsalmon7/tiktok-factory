import { GoogleGenAI } from '@google/genai'

type ReferenceImage = {
  data: Buffer
  mimeType: string
}

type GenerateImageArgs = {
  apiKey: string
  styleInstructions: string
  illustrationPrompt: string
  referenceImages?: ReferenceImage[]
  model?: string
}

/**
 * Calls Gemini image generation. Reference images (if any) are passed first as
 * inline image parts, then the style instructions + scene prompt as text.
 * This mirrors how the original Content Factory pipeline works: Gemini sees the
 * style examples before being asked to generate the new illustration.
 */
export async function generateImage({
  apiKey,
  styleInstructions,
  illustrationPrompt,
  referenceImages = [],
  model = 'gemini-2.5-flash-image',
}: GenerateImageArgs): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey })

  const parts: Array<
    | { inlineData: { data: string; mimeType: string } }
    | { text: string }
  > = []

  // 1. Reference images first (Gemini conditions on these)
  for (const img of referenceImages) {
    parts.push({
      inlineData: {
        data: img.data.toString('base64'),
        mimeType: img.mimeType,
      },
    })
  }

  // 2. Style instructions + scene prompt
  // CRITICAL: if reference images were provided, explicitly tell Gemini they define
  // ARTISTIC STYLE only (technique, brushstroke, flatness, colour palette) — NOT any
  // character attribute such as hair colour, eye colour, skin tone, etc.
  // Without this, Gemini visually conditions on ALL attributes of the reference images,
  // systematically overriding the hair colour (and other details) specified in the prompt.
  const referenceNote = referenceImages.length > 0
    ? `⚠️ REFERENCE IMAGES — USAGE RESTRICTION ⚠️
The images shown above define the ARTISTIC STYLE ONLY: painting technique, brushstroke texture, colour flatness, and overall visual aesthetic.
They do NOT define hair colour, eye colour, skin tone, facial features, or any other character attribute.
All character attributes (including hair colour) MUST come exclusively from the scene description below — the reference images must have ZERO influence on them.\n\n`
    : ''

  const fullText = `${referenceNote}${styleInstructions}\n\nNow generate one illustration for this scene:\n${illustrationPrompt}\n\nApply the artistic style (technique, texture, flatness, colour palette) from the reference images above. Character attributes — especially hair colour — come ONLY from the scene description; ignore whatever hair colour or character details appear in the reference images. Return only the image.`
  parts.push({ text: fullText })

  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts }],
    config: { responseModalities: ['IMAGE'] },
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
