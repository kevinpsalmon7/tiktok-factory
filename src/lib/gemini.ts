import { GoogleGenAI } from '@google/genai'
import type { Logger } from './logger'

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
  log?: Logger
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
  log,
}: GenerateImageArgs): Promise<Buffer> {
  const ai = new GoogleGenAI({ apiKey })

  const systemInstructionText = `${styleInstructions}${compositionRulesForSlide(slideType)}`

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

  await log?.({
    step: `gemini.request.${slideType || 'unknown'}`,
    message: `Gemini generateContent — slide_type=${slideType || 'unknown'}, refs=${referenceImages.length}`,
    payload: {
      model,
      slideType,
      referenceImageCount: referenceImages.length,
      referenceMimeTypes: referenceImages.map((r) => r.mimeType),
      systemInstruction: systemInstructionText,
      userPromptText: illustrationPrompt,
      compositionRulesAppended: compositionRulesForSlide(slideType),
    },
  })

  const startedAt = Date.now()
  const response = await ai.models.generateContent({
    model,
    contents: [{ role: 'user', parts: userParts }],
    config: {
      responseModalities: ['IMAGE'],
      systemInstruction: systemInstructionText,
    },
  })
  const elapsedMs = Date.now() - startedAt

  // Find the image part in the response
  const candidates = response.candidates || []
  for (const candidate of candidates) {
    const candidateParts = candidate.content?.parts || []
    for (const part of candidateParts) {
      if (part.inlineData?.data) {
        const buf = Buffer.from(part.inlineData.data, 'base64')
        await log?.({
          step: `gemini.response.${slideType || 'unknown'}`,
          message: `Gemini returned image (${buf.length} bytes, ${elapsedMs} ms)`,
          payload: {
            slideType,
            imageBytes: buf.length,
            elapsedMs,
            finishReason: candidate.finishReason,
          },
        })
        return buf
      }
    }
  }

  await log?.({
    step: `gemini.response.${slideType || 'unknown'}`,
    message: 'Gemini returned no image data',
    level: 'error',
    payload: {
      slideType,
      elapsedMs,
      candidatesCount: candidates.length,
      finishReasons: candidates.map((c) => c.finishReason),
      // Capture any text the model returned (e.g. safety blocks)
      candidateTexts: candidates.map((c) => c.content?.parts?.filter((p) => p.text).map((p) => p.text)),
    },
  })

  throw new Error('Gemini returned no image data')
}
