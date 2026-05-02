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
- Slide 1: title (title role)
- Slides 2 to N: content (title + text roles)
- Last slide: CTA (title + text + cta roles)
`,
  carousel_instructions: `Generate a carousel of 6 to 8 slides about a specific experience of adult ADHD in women.

Use the available slide types and fill the required text roles for each slide.

Return a JSON array of carousels. No markdown, no explanation.`,
  gemini_instructions: `Create a painterly portrait of a young woman, warm colors, softly illuminated, artistic painted style, 9:16 vertical composition. Leave space in the composition for text to be overlaid. Pastel background with subtle texture. The woman should evoke the emotion described in the prompt.`,
  layout: {
    width: 1080,
    height: 1920,
    backgroundColor: '#f9d5e5',
    slideTypes: ['title', 'content', 'cta'],
    padding: { top: 120, right: 80, bottom: 120, left: 80 },
    elements: [
      // ── TITLE slide ──
      {
        id: 'title_bg',
        type: 'image',
        source: 'generated',
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        zIndex: 0,
        fit: 'cover',
        opacity: 1,
        slideType: 'title',
      },
      {
        id: 'title_heading',
        type: 'text',
        role: 'title',
        x: 80,
        y: 800,
        width: 920,
        height: 400,
        zIndex: 2,
        fontSize: 120,
        fontFamily: 'Fraunces',
        fontWeight: 700,
        color: '#000000',
        backgroundColor: '#ffffff',
        bgMode: 'inline',
        padding: 20,
        lineHeight: 1,
        align: 'left',
        placeholder: 'Title',
        slideType: 'title',
      },

      // ── CONTENT slide ──
      {
        id: 'content_bg',
        type: 'image',
        source: 'generated',
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        zIndex: 0,
        fit: 'cover',
        opacity: 1,
        slideType: 'content',
      },
      {
        id: 'content_heading',
        type: 'text',
        role: 'title',
        x: 80,
        y: 900,
        width: 920,
        height: 280,
        zIndex: 2,
        fontSize: 82,
        fontFamily: 'Fraunces',
        fontWeight: 700,
        color: '#000000',
        backgroundColor: '#ffffff',
        bgMode: 'inline',
        padding: 12,
        lineHeight: 1,
        align: 'left',
        placeholder: 'Heading',
        slideType: 'content',
      },
      {
        id: 'content_body',
        type: 'text',
        role: 'text',
        x: 80,
        y: 1220,
        width: 920,
        height: 400,
        zIndex: 2,
        fontSize: 42,
        fontFamily: 'Inter',
        fontWeight: 400,
        color: '#000000',
        backgroundColor: '#ffffff',
        bgMode: 'inline',
        padding: 8,
        lineHeight: 1.2,
        align: 'left',
        placeholder: 'Body text goes here.',
        slideType: 'content',
      },

      // ── CTA slide ──
      {
        id: 'cta_bg',
        type: 'image',
        source: 'generated',
        x: 0,
        y: 0,
        width: 1080,
        height: 1920,
        zIndex: 0,
        fit: 'cover',
        opacity: 1,
        slideType: 'cta',
      },
      {
        id: 'cta_heading',
        type: 'text',
        role: 'title',
        x: 80,
        y: 900,
        width: 920,
        height: 280,
        zIndex: 2,
        fontSize: 82,
        fontFamily: 'Fraunces',
        fontWeight: 700,
        color: '#000000',
        backgroundColor: '#ffffff',
        bgMode: 'inline',
        padding: 12,
        lineHeight: 1,
        align: 'left',
        placeholder: 'Want more?',
        slideType: 'cta',
      },
      {
        id: 'cta_body',
        type: 'text',
        role: 'text',
        x: 80,
        y: 1220,
        width: 920,
        height: 300,
        zIndex: 2,
        fontSize: 42,
        fontFamily: 'Inter',
        fontWeight: 400,
        color: '#000000',
        backgroundColor: '#ffffff',
        bgMode: 'inline',
        padding: 8,
        lineHeight: 1.2,
        align: 'left',
        placeholder: 'Comment your story below.',
        slideType: 'cta',
      },
      {
        id: 'cta_keyword',
        type: 'text',
        role: 'cta',
        x: 80,
        y: 1560,
        width: 920,
        height: 120,
        zIndex: 2,
        fontSize: 56,
        fontFamily: 'Inter',
        fontWeight: 700,
        color: '#000000',
        backgroundColor: '#ffffff',
        bgMode: 'inline',
        padding: 12,
        lineHeight: 1,
        align: 'left',
        placeholder: 'KEYWORD',
        slideType: 'cta',
      },
    ],
  } satisfies TemplateLayout,
}
