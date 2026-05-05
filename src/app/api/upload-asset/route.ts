import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
    const filename = `${Date.now()}.${ext}`
    const path = `${user.id}/assets/${filename}`

    const { error: uploadErr } = await supabase.storage
      .from('carousel-slides')
      .upload(path, buffer, { contentType: file.type, upsert: true })

    if (uploadErr) {
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('carousel-slides').getPublicUrl(path)
    return NextResponse.json({ url: urlData.publicUrl })
  } catch (e) {
    console.error('[upload-asset]', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
