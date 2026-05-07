import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { generateCarousels, extractIntent } from '@/lib/gemini-text'
import { createLogger } from '@/lib/logger'
import { randomUUID } from 'crypto'

// Allow up to 120s — parallel Claude calls for large batches need the headroom
export const maxDuration = 120

type ProfileRow = {
  master_instructions: string
  avatar_instructions: string
  gemini_api_key: string | null
}

import type { TemplateLayout, TextElement } from '@/types/database'

type TemplateRow = {
  style_guide: string
  carousel_instructions: string
  avatar_instructions: string
  layout: TemplateLayout
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { templateId, prompt: userPrompt } = body as {
    templateId: string
    prompt?: string
  }

  if (!templateId) {
    return NextResponse.json({ error: 'templateId required' }, { status: 400 })
  }

  // One run_id per "Générer" click — links every log entry from this batch.
  // Front passes runId to /api/generate-image so image logs share the same run.
  const runId = (body as { runId?: string }).runId || randomUUID()
  const log = createLogger(supabase, user.id, runId)
  await log({ step: 'run.start', message: 'generate-text run started', payload: { templateId, userPrompt, runId } })

  // Fetch last 2 days of completed carousels for topic avoidance
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentCarousels } = await supabase
    .from('carousels')
    .select('title, carousel_type, slides, created_at')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('created_at', twoDaysAgo)
    .order('created_at', { ascending: false })
    .returns<{ title: string; carousel_type: string; slides: { text_fields: Record<string, string> }[]; created_at: string }[]>()

  const { data: profile } = await supabase
    .from('profiles')
    .select('master_instructions, avatar_instructions, gemini_api_key')
    .eq('id', user.id)
    .single<ProfileRow>()

  const { data: template } = await supabase
    .from('templates')
    .select('style_guide, carousel_instructions, avatar_instructions, layout')
    .eq('id', templateId)
    .eq('user_id', user.id)
    .single<TemplateRow>()

  if (!template) {
    return NextResponse.json({ error: 'Template not found' }, { status: 404 })
  }

  const apiKey = profile?.gemini_api_key || process.env.GEMINI_API_KEY
  if (!apiKey) {
    return NextResponse.json(
      { error: 'Clé API Gemini manquante. Renseignez-la dans Paramètres.' },
      { status: 400 }
    )
  }

  // Build a per-slide-type role map from the template layout so Claude knows
  // which text roles to fill for each slide type.
  const rolesByType: Record<string, string[]> = {}
  for (const st of template.layout.slideTypes || []) rolesByType[st] = []
  for (const el of template.layout.elements || []) {
    if (el.type === 'text') {
      const textEl = el as TextElement
      if (!rolesByType[el.slideType]) rolesByType[el.slideType] = []
      // Collect per-paragraph roles (new model) or fall back to element-level role
      const roles: string[] =
        textEl.paragraphs && textEl.paragraphs.length > 0
          ? textEl.paragraphs.map((p) => p.role ?? textEl.role)
          : [textEl.role]
      for (const role of roles) {
        if (!rolesByType[el.slideType].includes(role)) rolesByType[el.slideType].push(role)
      }
    }
  }

  try {
    // Build history block from last 2 days
    let historyBlock = ''
    if (recentCarousels && recentCarousels.length > 0) {
      const lines = recentCarousels.map((c) => {
        const label = c.title || c.carousel_type || 'Sans titre'
        const texts = (c.slides || []).flatMap(s => Object.values(s.text_fields || {})).filter(Boolean)
        return `- ${label}: ${texts.slice(0, 3).join(' / ')}`
      })
      historyBlock = `RECENT HISTORY (last 48h — do NOT repeat these topics or angles):\n${lines.join('\n')}`
    }

    await log({ step: 'history.loaded', message: `${recentCarousels?.length || 0} recent carousel(s) loaded for history block`, payload: { historyBlock } })

    // Parse natural language: extract exact count + unique per-carousel instructions
    const intent = await extractIntent(userPrompt || '', apiKey, log)

    // Generate all carousels in parallel — avoids sequential latency that
    // causes Vercel timeouts on batches of 5+ carousels.
    const results = await Promise.all(
      Array.from({ length: intent.count }, (_, i) =>
        generateCarousels({
          apiKey,
          styleGuide: template.style_guide,
          carouselInstructions: template.carousel_instructions,
          masterInstructions: profile?.master_instructions,
          avatarInstructions: template.avatar_instructions || profile?.avatar_instructions,
          userPrompt: intent.perCarousel[i] || userPrompt || '',
          historyBlock,
          count: 1,
          rolesByType,
          log,
          carouselTag: String(i + 1),
        })
      )
    )

    const allCarousels = results.flat()
    await log({ step: 'run.text_done', message: `${allCarousels.length} carousel(s) generated, returning to client`, payload: { carouselCount: allCarousels.length } })
    return NextResponse.json({ carousels: allCarousels, runId })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await log({ step: 'run.error', message: `generate-text failed: ${message}`, level: 'error', payload: { stack: err instanceof Error ? err.stack : null } })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
