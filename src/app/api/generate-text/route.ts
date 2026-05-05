import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCarousels, extractIntent } from '@/lib/anthropic'

type ProfileRow = {
  master_instructions: string
  avatar_instructions: string
  anthropic_api_key: string | null
}

import type { TemplateLayout, TextElement } from '@/types/database'

type TemplateRow = {
  style_guide: string
  carousel_instructions: string
  avatar_instructions: string
  layout: TemplateLayout
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { templateId, prompt: userPrompt } = body as {
    templateId: string
    prompt?: string
  }

  if (!templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 })
  }

  // Fetch last 2 days of completed carousels for topic avoidance
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentCarousels } = await supabase
    .from('carousels')
    .select('title, carousel_type, slides, created_at')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('created_at', twoDaysAgo)
    .order('created_at', { ascending: false })
    .returns<{ title: string; carousel_type: string; slides: { text_fields: Record<string, string> }[]; created_at: string }[]>()

  const { data: profile } = await supabase
    .from('profiles')
    .select('master_instructions, avatar_instructions, anthropic_api_key')
    .eq('id', user.id)
    .single<ProfileRow>()

  const { data: template } = await supabase
    .from('templates')
    .select('style_guide, carousel_instructions, avatar_instructions, layout')
    .eq('id', templateId)
    .eq('user_id', user.id)
    .single<TemplateRow>()

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const apiKey = profile?.anthropic_api_key || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Clé API Anthropic manquante. Renseignez-la dans Paramètres.' },
      { status: 400 }
    )
  }

  // Build a per-slide-type role map from the template layout so Claude knows
  // which text roles to fill for each slide type.
  const rolesByType: Record<string, string[]> = {}
  for (const st of template.layout.slideTypes || []) rolesByType[st] = []
  for (const el of template.layout.elements || []) {
    if (el.type === 'text') {
      const textEl = el as TextElement
      if (!rolesByType[el.slideType]) rolesByType[el.slideType] = []
      // Collect per-paragraph roles (new model) or fall back to element-level role
      const roles: string[] =
        textEl.paragraphs && textEl.paragraphs.length > 0
          ? textEl.paragraphs.map((p) => p.role ?? textEl.role)
          : [textEl.role]
      for (const role of roles) {
        if (!rolesByType[el.slideType].includes(role)) rolesByType[el.slideType].push(role)
      }
    }
  }

  try {
    // Build history block from last 2 days
    let historyBlock = ''
    if (recentCarousels && recentCarousels.length > 0) {
      const lines = recentCarousels.map((c) => {
        const label = c.title || c.carousel_type || 'Sans titre'
        const texts = (c.slides || []).flatMap(s => Object.values(s.text_fields || {})).filter(Boolean)
        return `- ${label}: ${texts.slice(0, 3).join(' / ')}`
      })
      historyBlock = `RECENT HISTORY (last 48h — do NOT repeat these topics or angles):
${lines.join('\n')}`
    }

    // Parse natural language: extract exact count + unique per-carousel instructions
    const intent = await extractIntent(userPrompt || '', apiKey)

    // Generate one carousel per specific instruction (each in isolation to avoid topic bleed)
    const allCarousels: unknown[] = []
    for (let i = 0; i < intent.count; i++) {
      const one = await generateCarousels({
        apiKey,
        styleGuide: template.style_guide,
        carouselInstructions: template.carousel_instructions,
        masterInstructions: profile?.master_instructions,
        avatarInstructions: template.avatar_instructions || profile?.avatar_instructions,
        userPrompt: intent.perCarousel[i] || userPrompt || '',
        historyBlock,
        count: 1,
        rolesByType,
      })
      allCarousels.push(...one)
    }

    return NextResponse.json({ carousels: allCarousels })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
