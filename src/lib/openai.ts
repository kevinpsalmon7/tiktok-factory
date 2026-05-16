import OpenAI, { toFile } from 'openai'
import type { Logger } from './logger'

type ReferenceImage = {
  data: Buffer
  mimeType: string
  filename?: string
}

export type SlideType = 'title' | 'content' | 'cta' | string

type GenerateImageArgs = {
  apiKey: string
  styleInstructions: string
  illustrationPrompt: string
  referenceImages?: ReferenceImage[]
  slideType?: SlideType
  model?: string
  quality?: 'low' | 'medium' | 'high'
  imageSize?: '1024x1024' | '1024x1536' | '1536x1024'
  log?: Logger
}

/**
 * Slide-type composition rules. Folded into the prompt because gpt-image-2
 * does not have a separate systemInstruction channel — everything goes in
 * the prompt.
 */
// Per-slide composition rules are now defined entirely in each template's
// gemini_instructions (style guide). No hardcoded rules — the template owns
// everything about framing, background, and composition.
function compositionRulesForSlide(_slideType?: SlideType): string {
  return ''
}

/**
 * Calls OpenAI's gpt-image-2 model via the images.edit endpoint, which
 * accepts up to 16 reference images plus a prompt. The reference images
 * provide visual conditioning for style; the prompt carries all textual
 * instructions (style guide + slide-type composition rules + scene).
 *
 * Returns the raw image bytes (PNG by default).
 */
export async function generateImage({
  apiKey,
  styleInstructions,
  illustrationPrompt,
  referenceImages = [],
  slideType,
  model = 'gpt-image-2',
  quality = 'low',
  imageSize = '1024x1024',
  log,
}: GenerateImageArgs): Promise<Buffer> {
  const client = new OpenAI({ apiKey })

  // Build the unified prompt. Order: style guide → slide-type rules → scene.
  const fullPrompt = `${styleInstructions}${compositionRulesForSlide(slideType)}\n\nNow generate one illustration for this scene:\n${illustrationPrompt}`

  // Convert reference image buffers into Uploadable files for the SDK.
  const imageFiles = await Promise.all(
    referenceImages.map(async (img, idx) => {
      const ext = img.mimeType.split('/')[1] || 'png'
      const filename = img.filename || `reference_${idx}.${ext}`
      return toFile(img.data, filename, { type: img.mimeType })
    })
  )

  await log?.({
    step: `openai.request.${slideType || 'unknown'}`,
    message: `OpenAI images.edit — slide_type=${slideType || 'unknown'}, refs=${referenceImages.length}`,
    payload: {
      model,
      slideType,
      referenceImageCount: referenceImages.length,
      referenceMimeTypes: referenceImages.map((r) => r.mimeType),
      fullPrompt,
      compositionRulesAppended: compositionRulesForSlide(slideType),
      illustrationPrompt,
    },
  })

  const startedAt = Date.now()

  // images.edit requires at least one reference image; fall back to
  // images.generate when no references are available for this template.
  const response = imageFiles.length > 0
    ? await client.images.edit({
        model,
        image: imageFiles.length === 1 ? imageFiles[0] : imageFiles,
        prompt: fullPrompt,
        size: imageSize,
        quality,
        n: 1,
      })
    : await client.images.generate({
        model,
        prompt: fullPrompt,
        size: imageSize,
        quality,
        n: 1,
      })

  const elapsedMs = Date.now() - startedAt
  const b64 = response.data?.[0]?.b64_json

  if (!b64) {
    await log?.({
      step: `openai.response.${slideType || 'unknown'}`,
      message: 'OpenAI returned no image data',
      level: 'error',
      payload: {
        slideType,
        elapsedMs,
        rawResponse: JSON.parse(JSON.stringify(response)),
      },
    })
    throw new Error('OpenAI returned no image data')
  }

  const buf = Buffer.from(b64, 'base64')
  await log?.({
    step: `openai.response.${slideType || 'unknown'}`,
    message: `OpenAI returned image (${buf.length} bytes, ${elapsedMs} ms)`,
    payload: {
      slideType,
      imageBytes: buf.length,
      elapsedMs,
      // OpenAI returns usage info on the response in newer SDKs
      usage: 'usage' in response ? response.usage : undefined,
    },
  })

  return buf
}
