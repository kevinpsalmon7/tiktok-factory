import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { summary, is_default } = body as { summary?: string; is_default?: boolean }

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
