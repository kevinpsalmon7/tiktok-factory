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
  // CRITICAL: reference images define ARTISTIC TECHNIQUE only — they must NOT drive
  // character attributes, framing/composition, or narrative/editorial mood.
  // Gemini visually conditions on everything it sees first, so we must explicitly
  // fence what the references are authoritative for vs what the text instructions govern.
  const referenceNote = referenceImages.length > 0
    ? `REFERENCE IMAGES — READ THIS BEFORE ANYTHING ELSE:
The images above are style references. They convey ONLY the artistic technique to apply: brushstroke quality, paint texture, level of graphic flatness, colour rendering style, and overall visual medium.
They are NOT a content template. They do NOT dictate: character attributes (hair colour, eye colour, skin tone, age, clothing), shot framing (close-up vs wide), scene composition, mood, narrative tone, or any subject matter.
Every content decision — framing, composition, characters, mood, atmosphere — comes exclusively from the written instructions below. The reference images have zero authority over content.\n\n`
    : ''

  const fullText = `${referenceNote}${styleInstructions}\n\nNow generate one illustration for this scene:\n${illustrationPrompt}\n\nRender this scene using the artistic technique visible in the reference images (brushstroke, texture, flatness, colour rendering). All content — framing, composition, character details, mood — must follow the scene description and style instructions above, not the reference images. Return only the image.`
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
