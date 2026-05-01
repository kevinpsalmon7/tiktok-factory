import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { carouselId, slideIndex, dataUrl } = body as {
    carouselId: string
    slideIndex: number
    dataUrl: string // base64 data URL from Konva stage.toDataURL()
  }

  if (!carouselId || slideIndex == null || !dataUrl) {
    return NextResponse.json(
      { error: 'carouselId, slideIndex, dataUrl required' },
      { status: 400 }
    )
  }

  // Extract base64 payload
  const match = dataUrl.match(/^data:(image\/[^;]+);base64,(.+)$/)
  if (!match) {
    return NextResponse.json({ error: 'Invalid data URL' }, { status: 400 })
  }
  const contentType = match[1]
  const buffer = Buffer.from(match[2], 'base64')

  const ext = contentType.includes('png') ? 'png' : 'jpg'
  const path = `${user.id}/${carouselId}/slide_${String(slideIndex).padStart(2, '0')}.${ext}`

  const { error: uploadErr } = await supabase.storage
    .from('carousel-slides')
    .upload(path, buffer, { contentType, upsert: true })

  if (uploadErr) {
    return NextResponse.json({ error: uploadErr.message }, { status: 500 })
  }

  const { data: urlData } = supabase.storage.from('carousel-slides').getPublicUrl(path)
  return NextResponse.json({ url: urlData.publicUrl, path })
}
