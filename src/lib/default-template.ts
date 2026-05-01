import type { TemplateLayout } from '@/types/database'

// Default starter template cloned from the original ADHD_Or_Just_Me.
// The user can rename it and modify the layout visually in the builder.
export const defaultADHDTemplate = {
  name: 'ADHD Or Just Me',
  description: 'Template de départ — carousels TikTok introspectifs sur le TDAH',
  platforms: ['tiktok'],
  style_guide: `# Style guide

## Voice and tone
- Second person "you" — intimate, direct
- Short sentences. Fragments welcome.
- Declarative, no hedging
- English only

## Punctuation
- Never use em dash "—"
- Never use hyphen "-" as punctuation (only inside compound words)
- Natural periods and commas

## Structure per carousel
- Slide 1: title (headline + subtitle)
- Slides 2 to N: content (heading + body)
- Last slide: CTA
`,
  carousel_instructions: `Generate a carousel of 6 to 8 slides about a specific experience of adult ADHD in women.

Each slide JSON must include:
- index: 1..N
- slide_type: "title" | "content" | "cta"
- text_fields: object with heading_text, body_text, keyword_text (CTA only)
- illustration_prompt: short description for the background image

Return a JSON array of carousels. No markdown, no explanation.`,
  gemini_instructions: `Create a painterly portrait of a young woman, warm colors, softly illuminated, artistic painted style, 9:16 vertical composition. Leave space in the composition for text to be overlaid. Pastel background with subtle texture. The woman should evoke the emotion described in the prompt.`,
  layout: {
    width: 1080,
    height: 1920,
    backgroundColor: '#f9d5e5',
    elements: [
      // Background image (Gemini-generated)
      {
        id: 'bg',
        type: 'image',
        source: 'generated',
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        zIndex: 0,
        fit: 'cover',
        opacity: 1,
      },
      // Heading text block — present on all slide types
      {
        id: 'heading',
        type: 'text',
        field: 'heading_text',
        x: 120,
        y: 900,
        width: 840,
        height: 300,
        zIndex: 2,
        fontSize: 82,
        fontFamily: 'Playfair Display',
        fontWeight: 700,
        color: '#000000',
        backgroundColor: '#ffffff',
        padding: 12,
        lineHeight: 1,
        align: 'left',
        placeholder: 'Heading text',
        slideTypes: ['title', 'content', 'cta'],
      },
      // Body text block — content + CTA
      {
        id: 'body',
        type: 'text',
        field: 'body_text',
        x: 120,
        y: 1220,
        width: 840,
        height: 400,
        zIndex: 2,
        fontSize: 42,
        fontFamily: 'Open Sans',
        fontWeight: 400,
        color: '#000000',
        backgroundColor: '#ffffff',
        padding: 8,
        lineHeight: 1.1,
        align: 'left',
        placeholder: 'Body text',
        slideTypes: ['content', 'cta'],
      },
      // CTA keyword — only on CTA slide
      {
        id: 'keyword',
        type: 'text',
        field: 'keyword_text',
        x: 120,
        y: 1640,
        width: 840,
        height: 80,
        zIndex: 2,
        fontSize: 44,
        fontFamily: 'Open Sans',
        fontWeight: 700,
        color: '#000000',
        backgroundColor: '#ffffff',
        padding: 8,
        lineHeight: 1,
        align: 'left',
        placeholder: 'COMMENT KEYWORD',
        slideTypes: ['cta'],
      },
    ],
  } satisfies TemplateLayout,
}
