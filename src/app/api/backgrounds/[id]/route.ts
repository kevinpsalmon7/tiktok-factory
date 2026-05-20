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
  const { is_default, name } = body as { is_default?: boolean; name?: string }

  // If setting as default, clear all others for this template first
  if (is_default === true) {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: bg } = await (supabase.from('template_backgrounds') as any)
      .select('template_id')
      .eq('id', id)
      .eq('user_id', user.id)
      .single()

    if (bg) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('template_backgrounds') as any)
        .update({ is_default: false })
        .eq('template_id', bg.template_id)
        .eq('user_id', user.id)
    }
  }

  const patch: Record<string, unknown> = {}
  if (is_default !== undefined) patch.is_default = is_default
  if (name !== undefined) patch.name = name

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Aucun champ à mettre à jour' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data, error } = await (supabase.from('template_backgrounds') as any)
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)
    .select()
    .single()

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ background: data })
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
  const { data: bg, error: fetchErr } = await (supabase.from('template_backgrounds') as any)
    .select('storage_path')
    .eq('id', id)
    .eq('user_id', user.id)
    .single()

  if (fetchErr || !bg) {
    return NextResponse.json({ error: 'Background introuvable' }, { status: 404 })
  }

  await supabase.storage.from('template-backgrounds').remove([bg.storage_path])

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('template_backgrounds') as any)
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ success: true })
}
