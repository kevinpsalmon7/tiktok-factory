import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import { randomUUID } from 'crypto'

export const maxDuration = 60

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const templateId = searchParams.get('templateId')
  if (!templateId) return NextResponse.json({ error: 'templateId requis' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('template_pages') as any)
    .select('id, template_id, user_id, storage_path, summary, is_default, position, created_at')
    .eq('template_id', templateId)
    .eq('user_id', user.id)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ pages: data || [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const formData = await request.formData().catch(() => null)
  if (!formData) return NextResponse.json({ error: 'Données de formulaire invalides' }, { status: 400 })

  const templateId = formData.get('templateId') as string | null
  const imageFile = formData.get('image') as File | null

  if (!templateId || !imageFile) {
    return NextResponse.json({ error: 'templateId et image requis' }, { status: 400 })
  }

  // Fetch profile for anthropic_api_key
  const { data: profile } = await supabase
    .from('profiles')
    .select('anthropic_api_key')
    .eq('id', user.id)
    .single<{ anthropic_api_key: string | null }>()

  const apiKey = profile?.anthropic_api_key || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'Clé API Anthropic manquante. Renseignez-la dans Paramètres.' }, { status: 400 })
  }

  // Get current max position
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: existing } = await (supabase.from('template_pages') as any)
    .select('position')
    .eq('template_id', templateId)
    .eq('user_id', user.id)
    .order('position', { ascending: false })
    .limit(1)

  const nextPosition = existing && existing.length > 0 ? (existing[0].position + 1) : 0

  // Upload image to Supabase Storage
  const ext = imageFile.name.split('.').pop()?.toLowerCase() || 'jpg'
  const filename = `${randomUUID()}.${ext}`
  const storagePath = `${user.id}/${templateId}/${filename}`

  const arrayBuf = await imageFile.arrayBuffer()
  const imageBytes = Buffer.from(arrayBuf)

  const { error: uploadErr } = await supabase.storage
    .from('template-pages')
    .upload(storagePath, imageBytes, { contentType: imageFile.type || 'image/jpeg', upsert: false })

  if (uploadErr) {
    return NextResponse.json({ error: `Erreur upload: ${uploadErr.message}` }, { status: 500 })
  }

  // Generate summary with Claude
  let summary = ''
  try {
    const client = new Anthropic({ apiKey })
    type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
    const mimeType = (imageFile.type || 'image/jpeg') as MediaType
    const base64 = imageBytes.toString('base64')

    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 128,
      messages: [
        {
          role: 'user',
          content: [
            {
              type: 'image',
              source: { type: 'base64', media_type: mimeType, data: base64 },
            },
            {
              type: 'text',
              text: 'Lis cette page de livre et écris UNE seule phrase courte (15 mots max) qui résume de quoi parle cette page. Réponds uniquement avec cette phrase, sans ponctuation finale.',
            },
          ],
        },
      ],
    })
    summary = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
  } catch {
    // Summary generation failure is non-fatal — page still gets saved
    summary = ''
  }

  // Insert into DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertErr } = await (supabase.from('template_pages') as any)
    .insert({
      template_id: templateId,
      user_id: user.id,
      storage_path: storagePath,
      summary,
      is_default: nextPosition === 0, // first page is default
      position: nextPosition,
    })
    .select()
    .single()

  if (insertErr) {
    await supabase.storage.from('template-pages').remove([storagePath])
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ page: inserted })
}
