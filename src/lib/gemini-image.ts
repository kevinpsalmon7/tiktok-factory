import { GoogleGenAI, PersonGeneration } from '@google/genai'
import type { Logger } from './logger'

type GenerateImageArgs = {
  apiKey: string
  styleInstructions: string
  illustrationPrompt: string
  quality?: 'low' | 'medium' | 'high'
  slideType?: string
  log?: Logger
}

function compositionRulesForSlide(slideType?: string): string {
  switch (slideType) {
    case 'title':
      return '\n\n## CURRENT SLIDE — TITLE\nFraming: tight close-up. Face only or face and shoulders only. The figure occupies the dominant portion of the frame. No full body. No wide shot. No environmental storytelling.'
    case 'content':
      return '\n\n## CURRENT SLIDE — CONTENT\nComposition: abstract, atmospheric figure. Quiet, simplified, almost timeless backdrop. No narrative scene with multiple props or specific situations being lived out. A figure and a mood, nothing more.'
    case 'cta':
      return '\n\n## CURRENT SLIDE — CTA\nComposition: same abstract atmospheric rules as content slides. Clean, simple, no narrative.'
    default:
      return ''
  }
}

/**
 * Quality mapping:
 *   low    → imagen-3.0-fast-generate-001  (fast, cheaper)
 *   medium → imagen-3.0-generate-002       (high quality)
 *   high   → imagen-3.0-generate-002       (same model, Imagen 3 has no separate HD tier)
 */
const MODEL_BY_QUALITY: Record<'low' | 'medium' | 'high', string> = {
  low: 'imagen-3.0-fast-generate-001',
  medium: 'imagen-3.0-generate-002',
  high: 'imagen-3.0-generate-002',
}

export async function generateImage({
  apiKey,
  styleInstructions,
  illustrationPrompt,
  quality = 'low',
  slideType,
  log,
}: GenerateImageArgs): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey })
  const model = MODEL_BY_QUALITY[quality]

  const fullPrompt = `${styleInstructions}${compositionRulesForSlide(slideType)}\n\nNow generate one illustration for this scene:\n${illustrationPrompt}`

  await log?.({
    step: `gemini.image.request.${slideType || 'unknown'}`,
    message: `Gemini Imagen — model=${model} slide_type=${slideType || 'unknown'}`,
    payload: { model, quality, slideType, fullPrompt },
  })

  const startedAt = Date.now()

  const response = await ai.models.generateImages({
    model,
    prompt: fullPrompt,
    config: {
      numberOfImages: 1,
      aspectRatio: '9:16',
      outputMimeType: 'image/png',
      personGeneration: PersonGeneration.ALLOW_ALL,
    },
  })

  const elapsedMs = Date.now() - startedAt
  const b64 = response.generatedImages?.[0]?.image?.imageBytes

  if (!b64) {
    await log?.({
      step: `gemini.image.response.${slideType || 'unknown'}`,
      message: 'Gemini Imagen returned no image data',
      level: 'error',
      payload: { slideType, elapsedMs },
    })
    throw new Error('Gemini Imagen returned no image data')
  }

  const buf = Buffer.from(b64, 'base64')
  await log?.({
    step: `gemini.image.response.${slideType || 'unknown'}`,
    message: `Gemini Imagen returned image (${buf.length} bytes, ${elapsedMs} ms)`,
    payload: { slideType, imageBytes: buf.length, elapsedMs },
  })

  return buf
}
