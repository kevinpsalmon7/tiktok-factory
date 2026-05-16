import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'
import type { CarouselSlide } from '@/types/database'

export const maxDuration = 30

type PageRow = {
  id: string
  storage_path: string
  summary: string
  is_default: boolean
}

export async function POST(request: Request) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const body = await request.json().catch(() => ({}))
  const { templateId, slides } = body as { templateId?: string; slides?: CarouselSlide[] }

  if (!templateId) return NextResponse.json({ error: 'templateId requis' }, { status: 400 })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: rawPages, error } = await (supabase.from('template_pages') as any)
    .select('id, storage_path, summary, is_default')
    .eq('template_id', templateId)
    .eq('user_id', user.id)
    .order('position', { ascending: true })

  if (error) return NextResponse.json({ error: error.message }, { status: 500 })
  const pages: PageRow[] = (rawPages as PageRow[]) || []
  if (pages.length === 0) return NextResponse.json({ pageUrl: null })

  const getPublicUrl = (storagePath: string) =>
    supabase.storage.from('template-pages').getPublicUrl(storagePath).data.publicUrl

  if (pages.length === 1) {
    return NextResponse.json({ pageUrl: getPublicUrl(pages[0].storage_path) })
  }

  // Multiple pages — ask Claude to pick the most relevant one
  const { data: profile } = await supabase
    .from('profiles')
    .select('anthropic_api_key')
    .eq('id', user.id)
    .single<{ anthropic_api_key: string | null }>()

  const apiKey = profile?.anthropic_api_key || process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    // Fall back to default page if no API key
    const defaultPage = pages.find((p) => p.is_default) || pages[0]
    return NextResponse.json({ pageUrl: getPublicUrl(defaultPage.storage_path) })
  }

  const slideText = (slides || [])
    .map((s) => Object.values(s.text_fields || {}).filter(Boolean).join(' '))
    .filter(Boolean)
    .join('\n')

  const defaultPage = pages.find((p) => p.is_default) || pages[0]
  const pagesList = pages.map((p) => `${p.id}: ${p.summary}`).join('\n')

  try {
    const client = new Anthropic({ apiKey })
    const message = await client.messages.create({
      model: 'claude-sonnet-4-6',
      max_tokens: 64,
      messages: [
        {
          role: 'user',
          content: `Tu dois choisir la page de livre la plus pertinente pour illustrer ce contenu de carrousel.

Contenu du carrousel:
${slideText}

Pages disponibles (id → résumé):
${pagesList}

Réponds UNIQUEMENT avec l'id de la page la plus pertinente. Si aucune ne correspond bien, réponds avec l'id de la page par défaut: ${defaultPage.id}`,
        },
      ],
    })

    const raw = message.content[0].type === 'text' ? message.content[0].text.trim() : ''
    const selectedId = raw.replace(/[^a-f0-9-]/gi, '').trim()
    const selected = pages.find((p) => p.id === selectedId) || defaultPage

    return NextResponse.json({ pageUrl: getPublicUrl(selected.storage_path) })
  } catch {
    return NextResponse.json({ pageUrl: getPublicUrl(defaultPage.storage_path) })
  }
}
