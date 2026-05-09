import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

const ALLOWED_EXTS = ['ttf', 'otf', 'woff', 'woff2']
// Supabase Storage doesn't allow font/* MIME types by default.
// application/octet-stream is always accepted and browsers still load
// fonts correctly via @font-face regardless of the served content-type.
const MIME_TYPES: Record<string, string> = {
  ttf: 'application/octet-stream',
  otf: 'application/octet-stream',
  woff: 'application/octet-stream',
  woff2: 'application/octet-stream',
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const formData = await request.formData()
    const file = formData.get('file') as File | null
    const providedName = (formData.get('name') as string | null)?.trim()

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 })

    const ext = file.name.split('.').pop()?.toLowerCase() ?? ''
    if (!ALLOWED_EXTS.includes(ext)) {
      return NextResponse.json(
        { error: 'Format non supporté. Utilisez .ttf, .otf, .woff ou .woff2.' },
        { status: 400 }
      )
    }

    // Derive display name from filename if not provided
    const familyName =
      providedName ||
      file.name
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .replace(/\b\w/g, (c) => c.toUpperCase())

    const bytes = await file.arrayBuffer()
    const buffer = Buffer.from(bytes)
    const filename = `${Date.now()}.${ext}`
    const path = `${user.id}/fonts/${filename}`

    const { error: uploadErr } = await supabase.storage
      .from('carousel-slides')
      .upload(path, buffer, { contentType: MIME_TYPES[ext], upsert: true })

    if (uploadErr) return NextResponse.json({ error: uploadErr.message }, { status: 500 })

    const { data: urlData } = supabase.storage.from('carousel-slides').getPublicUrl(path)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row, error: dbErr } = await (supabase.from('user_fonts') as any)
      .insert({ user_id: user.id, family_name: familyName, url: urlData.publicUrl })
      .select('id, family_name, url')
      .single()

    if (dbErr) return NextResponse.json({ error: dbErr.message }, { status: 500 })

    return NextResponse.json(row)
  } catch (e) {
    console.error('[upload-font]', e)
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 })
  }
}
