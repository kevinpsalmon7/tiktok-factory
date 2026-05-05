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
  const fullText = `${styleInstructions}\n\nNow generate one illustration for this scene:\n${illustrationPrompt}\n\nFollow ALL style rules above strictly. Match the visual style of the reference images shown. Return only the image.`
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
