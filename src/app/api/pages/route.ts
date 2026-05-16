import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

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

  // Receive JSON — the image was already uploaded directly to Storage by the client
  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })

  const { templateId, storagePath, mimeType: rawMime } = body as {
    templateId?: string
    storagePath?: string
    mimeType?: string
  }

  if (!templateId || !storagePath) {
    return NextResponse.json({ error: 'templateId et storagePath requis' }, { status: 400 })
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

  // Generate summary with Claude — fetch image from public Storage URL
  let summary = ''
  try {
    const publicUrl = supabase.storage.from('template-pages').getPublicUrl(storagePath).data.publicUrl
    const imgRes = await fetch(publicUrl)
    if (imgRes.ok) {
      const arrayBuf = await imgRes.arrayBuffer()
      const imageBytes = Buffer.from(arrayBuf)
      const base64 = imageBytes.toString('base64')
      type MediaType = 'image/jpeg' | 'image/png' | 'image/gif' | 'image/webp'
      const mimeType = (rawMime || 'image/jpeg') as MediaType

      const client = new Anthropic({ apiKey })
      const message = await client.messages.create({
        model: 'claude-sonnet-4-5',
        max_tokens: 128,
        messages: [
          {
            role: 'user',
            content: [
              { type: 'image', source: { type: 'base64', media_type: mimeType, data: base64 } },
              { type: 'text', text: 'Lis cette page de livre et écris UNE seule phrase courte (15 mots max) qui résume de quoi parle cette page. Réponds uniquement avec cette phrase, sans ponctuation finale.' },
            ],
          },
        ],
      })
      summary = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    }
  } catch {
    // Non-fatal — page saved without summary
  }

  // Insert into DB
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertErr } = await (supabase.from('template_pages') as any)
    .insert({
      template_id: templateId,
      user_id: user.id,
      storage_path: storagePath,
      summary,
      is_default: nextPosition === 0,
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
