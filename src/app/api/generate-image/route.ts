import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateImage } from '@/lib/openai'
import { createLogger } from '@/lib/logger'
import { randomUUID } from 'crypto'

// gpt-image-2 can take 60-180s; set to Vercel Pro max.
export const maxDuration = 300

type ProfileRow = { openai_api_key: string | null }
type TemplateRow = { gemini_instructions: string }
type ReferenceRow = { storage_path: string }

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { templateId, illustrationPrompt, carouselId, slideIndex, slideType, runId: incomingRunId } = body as {
    templateId: string
    illustrationPrompt: string
    carouselId: string
    slideIndex: number
    slideType?: string
    runId?: string
  }

  const runId = incomingRunId || randomUUID()
  const log = createLogger(supabase, user.id, runId, carouselId)
  await log({ step: 'image.start', message: `image request slide=${slideIndex} type=${slideType || '?'}`, payload: { templateId, carouselId, slideIndex, slideType, illustrationPrompt } })

  if (!templateId || !illustrationPrompt || !carouselId || slideIndex == null) {
    return NextResponse.json(
      { error: 'templateId, illustrationPrompt, carouselId, slideIndex required' },
      { status: 400 }
    )
  }

  const { data: profile } = await supabase
    .from('profiles')
    .select('openai_api_key')
    .eq('id', user.id)
    .single<ProfileRow>()

  const { data: template } = await supabase
    .from('templates')
    .select('gemini_instructions')
    .eq('id', templateId)
    .eq('user_id', user.id)
    .single<TemplateRow>()

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const apiKey = profile?.openai_api_key || process.env.OPENAI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Clé API OpenAI manquante. Renseignez-la dans Paramètres.' },
      { status: 400 }
    )
  }

  // Load reference images for this template
  const { data: refs } = await supabase
    .from('template_references')
    .select('storage_path')
    .eq('template_id', templateId)
    .eq('user_id', user.id)
    .order('position', { ascending: true })
    .returns<ReferenceRow[]>()

  const referenceImages: { data: Buffer; mimeType: string }[] = []
  const refPaths: string[] = []
  for (const ref of refs || []) {
    const { data: blob, error } = await supabase.storage
      .from('template-references')
      .download(ref.storage_path)
    if (error || !blob) continue
    const arrayBuf = await blob.arrayBuffer()
    referenceImages.push({
      data: Buffer.from(arrayBuf),
      mimeType: blob.type || 'image/jpeg',
    })
    refPaths.push(ref.storage_path)
  }
  await log({ step: 'image.refs_loaded', message: `${referenceImages.length} reference image(s) loaded`, payload: { count: referenceImages.length, paths: refPaths } })

  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const sharp = require('sharp')

    const rawBytes = await generateImage({
      apiKey,
      styleInstructions: template.gemini_instructions,
      illustrationPrompt,
      referenceImages,
      slideType,
      log,
    })

    // Resize to 1080×1920 (9:16)
    const imageBytes: Buffer = await sharp(rawBytes)
      .resize(1080, 1920, { fit: 'cover', position: 'centre' })
      .jpeg({ quality: 92 })
      .toBuffer()

    // Upload to Supabase Storage
    const path = `${user.id}/${carouselId}/bg_${String(slideIndex).padStart(2, '0')}.jpg`
    const { error: uploadErr } = await supabase.storage
      .from('carousel-slides')
      .upload(path, imageBytes, {
        contentType: 'image/jpeg',
        upsert: true,
      })

    if (uploadErr) {
      await log({ step: 'image.upload_error', message: uploadErr.message, level: 'error', payload: { path } })
      return NextResponse.json({ error: uploadErr.message }, { status: 500 })
    }

    const { data: urlData } = supabase.storage.from('carousel-slides').getPublicUrl(path)
    await log({ step: 'image.uploaded', message: 'image uploaded to storage', payload: { path, url: urlData.publicUrl, bytes: imageBytes.length } })

    return NextResponse.json({
      url: urlData.publicUrl,
      path,
      referenceCount: referenceImages.length,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await log({ step: 'image.error', message, level: 'error', payload: { stack: err instanceof Error ? err.stack : null } })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
