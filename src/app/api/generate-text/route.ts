import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCarousels } from '@/lib/anthropic'

type ProfileRow = {
  master_instructions: string
  avatar_instructions: string
  anthropic_api_key: string | null
}

type TemplateRow = {
  style_guide: string
  carousel_instructions: string
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
    .select('style_guide, carousel_instructions')
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

  try {
    const carousels = await generateCarousels({
      apiKey,
      styleGuide: template.style_guide,
      carouselInstructions: template.carousel_instructions,
      masterInstructions: profile?.master_instructions,
      avatarInstructions: profile?.avatar_instructions,
      userPrompt,
      count,
    })
    return NextResponse.json({ carousels })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
