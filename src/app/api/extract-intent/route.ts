import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { extractIntent as extractIntentGemini } from '@/lib/gemini-text'
import { extractIntent as extractIntentClaude } from '@/lib/anthropic'
import { extractIntent as extractIntentChatGPT } from '@/lib/openai-text'
import { createLogger } from '@/lib/logger'
import { randomUUID } from 'crypto'

export const maxDuration = 60

type ProfileRow = {
  gemini_api_key: string | null
  anthropic_api_key: string | null
  openai_api_key: string | null
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { prompt: userPrompt, llm = 'gemini' } = body as {
    prompt?: string
    llm?: 'gemini' | 'claude' | 'chatgpt'
  }

  const runId = randomUUID()
  const log = createLogger(supabase, user.id, runId)
  await log({ step: 'intent.start', message: 'extract-intent run started', payload: { userPrompt, llm, runId } })

  const { data: profile } = await supabase
    .from('profiles')
    .select('gemini_api_key, anthropic_api_key, openai_api_key')
    .eq('id', user.id)
    .single<ProfileRow>()

  const apiKey = llm === 'claude'
    ? (profile?.anthropic_api_key || process.env.ANTHROPIC_API_KEY)
    : llm === 'chatgpt'
    ? (profile?.openai_api_key || process.env.OPENAI_API_KEY)
    : (profile?.gemini_api_key || process.env.GEMINI_API_KEY)

  const providerLabel = llm === 'claude' ? 'Anthropic' : llm === 'chatgpt' ? 'OpenAI' : 'Gemini'
  if (!apiKey) {
    return NextResponse.json(
      { error: `Clé API ${providerLabel} manquante. Renseignez-la dans Paramètres.` },
      { status: 400 }
    )
  }

  // Load history block — same logic as before, returned to client so each
  // generate-text-one call doesn't have to re-fetch it.
  const twoDaysAgo = new Date(Date.now() - 2 * 24 * 60 * 60 * 1000).toISOString()
  const { data: recentCarousels } = await supabase
    .from('carousels')
    .select('title, carousel_type, slides, created_at')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .gte('created_at', twoDaysAgo)
    .order('created_at', { ascending: false })
    .returns<{ title: string; carousel_type: string; slides: { text_fields: Record<string, string> }[]; created_at: string }[]>()

  let historyBlock = ''
  if (recentCarousels && recentCarousels.length > 0) {
    const lines = recentCarousels.map((c) => {
      const label = c.title || c.carousel_type || 'Sans titre'
      const texts = (c.slides || []).flatMap(s => Object.values(s.text_fields || {})).filter(Boolean)
      return `- ${label}: ${texts.slice(0, 3).join(' / ')}`
    })
    historyBlock = `RECENT HISTORY (last 48h — do NOT repeat these topics or angles):\n${lines.join('\n')}`
  }

  try {
    const extractIntent = llm === 'claude' ? extractIntentClaude : llm === 'chatgpt' ? extractIntentChatGPT : extractIntentGemini
    const intent = await extractIntent(userPrompt || '', apiKey, log)
    await log({ step: 'intent.done', message: `intent extracted: ${intent.count} carousel(s)`, payload: { count: intent.count, perCarousel: intent.perCarousel } })
    return NextResponse.json({
      count: intent.count,
      perCarousel: intent.perCarousel,
      runId,
      historyBlock,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Unknown error'
    await log({ step: 'intent.error', message: `extract-intent failed: ${message}`, level: 'error', payload: { stack: err instanceof Error ? err.stack : null } })
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
