import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  // Fetch slides to clean up storage files
  const { data: carousel } = await supabase
    .from('carousels')
    .select('slides')
    .eq('id', id)
    .eq('user_id', user.id)
    .single<{ slides: { rendered_url?: string }[] }>()

  if (!carousel) return NextResponse.json({ error: 'Not found' }, { status: 404 })

  // List and delete all storage files for this carousel
  const { data: files } = await supabase.storage
    .from('carousel-slides')
    .list(`${user.id}/${id}`)

  if (files && files.length > 0) {
    const paths = files.map(f => `${user.id}/${id}/${f.name}`)
    await supabase.storage.from('carousel-slides').remove(paths)
  }

  // Delete the carousel row
  const { error } = await supabase
    .from('carousels')
    .delete()
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { title, description } = body as { title?: string; description?: string }

  const patch: Record<string, string> = {}
  if (title !== undefined) patch.title = title
  if (description !== undefined) patch.description = description

  if (Object.keys(patch).length === 0) {
    return NextResponse.json({ error: 'Nothing to update' }, { status: 400 })
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { error } = await (supabase.from('carousels') as any)
    .update(patch)
    .eq('id', id)
    .eq('user_id', user.id)

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  return NextResponse.json({ ok: true })
}
