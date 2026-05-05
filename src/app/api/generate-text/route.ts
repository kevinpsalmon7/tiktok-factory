import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCarousels } from '@/lib/anthropic'

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
  const { templateId, prompt: userPrompt, count = 1 } = body as {
    templateId: string
    prompt?: string
    count?: number
  }

  if (!templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 })
  }

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
    const carousels = await generateCarousels({
      apiKey,
      styleGuide: template.style_guide,
      carouselInstructions: template.carousel_instructions,
      masterInstructions: profile?.master_instructions,
      avatarInstructions: template.avatar_instructions || profile?.avatar_instructions,
      userPrompt,
      count,
      rolesByType,
    })
    return NextResponse.json({ carousels })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
