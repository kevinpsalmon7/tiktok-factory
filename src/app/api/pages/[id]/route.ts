import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { summary, is_default, regenerate } = body as {
    summary?: string
    is_default?: boolean
    regenerate?: boolean
  }

  // If setting as default, first clear all others for this template
  if (is_default === true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: page } = await (supabase.from('template_pages') as any)
      .select('template_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (page) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('template_pages') as any)
        .update({ is_default: false })
        .eq('template_id', page.template_id)
        .eq('user_id', user.id)
    }
  }

  // If regenerate flag: call Claude to generate a fresh summary
  if (regenerate === true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: pageRow } = await (supabase.from('template_pages') as any)
      .select('storage_path')
      .eq('id', id)
      .eq('user_id', user.id)
      .single() as { data: { storage_path: string } | null }

    if (!pageRow) return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })

    const { data: profile } = await supabase
      .from('profiles')
      .select('anthropic_api_key')
      .eq('id', user.id)
      .single<{ anthropic_api_key: string | null }>()

    const apiKey = profile?.anthropic_api_key || process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'Clé API Anthropic manquante' }, { status: 400 })

    const publicUrl = supabase.storage.from('template-pages').getPublicUrl(pageRow.storage_path).data.publicUrl

    const client = new Anthropic({ apiKey })
    let newSummary = ''
    try {
      const message = await client.messages.create({
        model: 'claude-haiku-4-5',
        max_tokens: 64,
        messages: [{
          role: 'user',
          content: [
            // Pass URL directly — avoids the 5 MB base64 limit entirely
            { type: 'image', source: { type: 'url', url: publicUrl } },
            { type: 'text', text: 'Lis cette page de livre et écris UNE seule phrase courte (15 mots max) qui résume de quoi parle cette page. Réponds uniquement avec cette phrase, sans ponctuation finale.' },
          ],
        }],
      })
      newSummary = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err)
      return NextResponse.json({ error: `Erreur Claude : ${msg}` }, { status: 500 })
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('template_pages') as any)
      .update({ summary: newSummary })
      .eq('id', id)
      .eq('user_id', user.id)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ page: data })
  }

  const patch: Record<string, unknown> = {}
  if (summary !== undefined) patch.summary = summary
  if (is_default !== undefined) patch.is_default = is_default

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('template_pages') as any)
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ page: data })
}

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: page, error: fetchErr } = await (supabase.from('template_pages') as any)
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !page) {
    return NextResponse.json({ error: 'Page introuvable' }, { status: 404 })
  }

  await supabase.storage.from('template-pages').remove([page.storage_path])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('template_pages') as any)
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
