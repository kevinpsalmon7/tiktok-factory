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
 * Slide-type-specific composition rules. These are injected just before the
 * scene prompt so they cannot be overridden by what Gemini sees in the
 * reference images. The user's prompts are intentionally vague and poetic;
 * these rules ensure that "vague" is filled in with abstract / atmospheric
 * composition rather than the editorial / narrative scenes that the visual
 * references would otherwise push toward.
 */
function compositionRulesForSlide(slideType?: SlideType): string {
  switch (slideType) {
    case 'title':
      return `MANDATORY FRAMING — TITLE SLIDE:
- Tight close-up. Face and shoulders only, OR face only.
- The figure must occupy the dominant portion of the frame.
- No full body, no wide shot, no environment storytelling.
- The background is a flat backdrop, not a scene.
- Abstract, atmospheric, poetic — never narrative.`
    case 'content':
      return `MANDATORY COMPOSITION — CONTENT SLIDE:
- Abstract, atmospheric, poetic — a figure and a mood, nothing more.
- FORBIDDEN: narrative editorial scenes (figure + multiple props + specific environment + storytelling action).
- FORBIDDEN: scenes that depict a specific situation being lived out (e.g. "a woman looking at her phone in her bedroom with open boxes around her").
- The figure exists in a quiet, simplified, almost timeless setting. Background is a backdrop, not a stage for action.
- No specific props beyond what is strictly necessary, no busy environments, no multiple objects telling a story.`
    case 'cta':
      return `MANDATORY COMPOSITION — CTA SLIDE:
- Same abstract / atmospheric rules as content slides.
- Clean simple composition, no narrative scene.`
    default:
      return `MANDATORY COMPOSITION:
- Abstract, atmospheric, poetic. A figure and a mood.
- FORBIDDEN: narrative editorial scenes with multiple props, specific situations, or storytelling action.`
  }
}

/**
 * Calls Gemini image generation. Reference images (if any) are passed first as
 * inline image parts, then the style instructions + scene prompt as text.
 *
 * Architecture note: the user's text prompts are intentionally vague and
 * poetic. Gemini fills in the gaps using whatever it sees first — i.e. the
 * reference images. To prevent the references from pushing every output
 * toward editorial / narrative scenes, we fence them with explicit text:
 *   1. The references define ARTISTIC TECHNIQUE only (technique, texture,
 *      flatness, palette).
 *   2. Slide-type-specific composition rules dictate framing & narrative
 *      restraint, regardless of what the references depict.
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

  // 2. Reference-image fence — references = technique only, never content / composition.
  const referenceNote = referenceImages.length > 0
    ? `REFERENCE IMAGES — READ THIS BEFORE ANYTHING ELSE:
The images above are style references. They convey ONLY the artistic TECHNIQUE: brushstroke quality, paint texture, level of graphic flatness, colour rendering, and overall visual medium.
They are NOT a content template. They do NOT dictate: character attributes (hair colour, eye colour, skin tone, age, clothing), shot framing, scene composition, mood, narrative tone, or any subject matter.
If the reference images depict narrative scenes with props, environments, or storytelling action, IGNORE that aspect entirely — extract only the painting technique.
Every content and composition decision comes exclusively from the written instructions below. The reference images have ZERO authority over content or composition.\n\n`
    : ''

  // 3. Slide-type-specific composition rules (mandatory, non-overridable).
  const compositionRules = compositionRulesForSlide(slideType)

  const fullText = `${referenceNote}${styleInstructions}

${compositionRules}

Now generate one illustration for this scene:
${illustrationPrompt}

Apply the artistic technique visible in the reference images (brushstroke, texture, flatness, colour rendering) — and ONLY the technique. The composition, framing, character details, and mood follow the rules above and the scene description; the reference images must not influence them. Return only the image.`
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
