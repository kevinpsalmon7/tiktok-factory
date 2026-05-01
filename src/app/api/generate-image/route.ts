import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateImage } from '@/lib/gemini'

type ProfileRow = { gemini_api_key: string | null }
type TemplateRow = { gemini_instructions: string }

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { templateId, illustrationPrompt, carouselId, slideIndex } = body as {
    templateId: string
    illustrationPrompt: string
    carouselId: string
    slideIndex: number
  }

  if (!templateId || !illustrationPrompt || !carouselId || slideIndex == null) {
    return NextResponse.json(
      { error: 'templateId, illustrationPrompt, carouselId, slideIndex required' },
      { status: 400 }
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('gemini_api_key')
    .eq('id', user.id)
    .single<ProfileRow>()

  const { data: template } = await supabase
    .from('templates')
    .select('gemini_instructions')
    .eq('id', templateId)
    .eq('user_id', user.id)
    .single<TemplateRow>()

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const apiKey = profile?.gemini_api_key || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Clé API Gemini manquante. Renseignez-la dans Paramètres.' },
      { status: 400 }
    )
  }

  try {
    const imageBytes = await generateImage({
      apiKey,
      styleInstructions: template.gemini_instructions,
      illustrationPrompt,
    })

    // Upload to Supabase Storage
    const path = `${user.id}/${carouselId}/bg_${String(slideIndex).padStart(2, '0')}.jpg`
    const { error: uploadErr } = await supabase.storage
      .from('carousel-slides')
      .upload(path, imageBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('carousel-slides').getPublicUrl(path)

    return NextResponse.json({ url: urlData.publicUrl, path })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
