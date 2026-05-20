import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { searchParams } = new URL(request.url)
  const templateId = searchParams.get('templateId')
  if (!templateId) return NextResponse.json({ error: 'templateId requis' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('template_backgrounds') as any)
    .select('id, template_id, user_id, storage_path, name, is_default, created_at')
    .eq('template_id', templateId)
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ backgrounds: data || [] })
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => null)
  if (!body) return NextResponse.json({ error: 'Body JSON invalide' }, { status: 400 })

  const { templateId, storagePath, name } = body as {
    templateId?: string
    storagePath?: string
    name?: string
  }

  if (!templateId || !storagePath) {
    return NextResponse.json({ error: 'templateId et storagePath requis' }, { status: 400 })
  }

  // Check if this is the first background for this template (make it default)
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { count } = await (supabase.from('template_backgrounds') as any)
    .select('id', { count: 'exact', head: true })
    .eq('template_id', templateId)
    .eq('user_id', user.id)

  const isFirst = (count ?? 0) === 0

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: inserted, error: insertErr } = await (supabase.from('template_backgrounds') as any)
    .insert({
      template_id: templateId,
      user_id: user.id,
      storage_path: storagePath,
      name: name || '',
      is_default: isFirst,
    })
    .select()
    .single()

  if (insertErr) {
    await supabase.storage.from('template-backgrounds').remove([storagePath])
    return NextResponse.json({ error: insertErr.message }, { status: 500 })
  }

  return NextResponse.json({ background: inserted })
}
