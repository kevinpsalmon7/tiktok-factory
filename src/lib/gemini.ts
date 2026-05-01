import { GoogleGenAI } from '@google/genai'

type GenerateImageArgs = {
  apiKey: string
  styleInstructions: string
  illustrationPrompt: string
  model?: string
}

/**
 * Calls Gemini image generation model and returns raw PNG/JPEG bytes.
 * The style instructions describe the global look; the illustration prompt
 * describes the specific scene for this slide.
 */
export async function generateImage({
  apiKey,
  styleInstructions,
  illustrationPrompt,
  model = 'gemini-2.5-flash-image',
}: GenerateImageArgs): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey })

  const fullPrompt = `${styleInstructions}\n\nScene: ${illustrationPrompt}`

  const response = await ai.models.generateContent({
    model,
    contents: fullPrompt,
  })

  // Find the image part in the response
  const candidates = response.candidates || []
  for (const candidate of candidates) {
    const parts = candidate.content?.parts || []
    for (const part of parts) {
      if (part.inlineData?.data) {
        return Buffer.from(part.inlineData.data, 'base64')
      }
    }
  }

  throw new Error('Gemini returned no image data')
}
