import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import Anthropic from '@anthropic-ai/sdk'

export const maxDuration = 60

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { accountId, count = 10 } = await request.json()
  if (!accountId) return NextResponse.json({ error: 'accountId required' }, { status: 400 })

  // Fetch account + instructions
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: account, error: accErr } = await (supabase.from('threads_accounts') as any)
    .select('id, username, instructions')
    .eq('id', accountId)
    .eq('user_id', user.id)
    .single()

  if (accErr || !account) return NextResponse.json({ error: 'Account not found' }, { status: 404 })

  // Fetch available images for this user
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: images } = await (supabase.from('threads_images') as any)
    .select('id, url, name')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(20)

  const imageList = (images || []).map((img: { url: string; name: string }) =>
    `- "${img.name}": ${img.url}`
  ).join('\n')

  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) return NextResponse.json({ error: 'Anthropic API key missing' }, { status: 400 })

  const client = new Anthropic({ apiKey })

  const systemPrompt = `You generate Threads posts (Meta) for TikTok content creators.
Threads posts are short, punchy, personal — max 500 characters each.
You must follow the account instructions STRICTLY.
Return ONLY a valid JSON array of objects, no markdown, no explanation.
Each object: { "content": "...", "image_url": "..." or null }`

  const userMessage = `Account: @${account.username}

ACCOUNT INSTRUCTIONS (follow strictly):
${account.instructions || 'No specific instructions — write engaging, authentic Threads posts for a TikTok content creator.'}

${imageList ? `AVAILABLE IMAGES (use the exact URL when relevant, otherwise set image_url to null):\n${imageList}` : 'No images available — set image_url to null for all posts.'}

Generate exactly ${count} Threads posts. Vary the format: some text-only, some with image when relevant.
Return a JSON array with exactly ${count} objects: [{"content":"...","image_url":"..." or null}, ...]`

  const message = await client.messages.create({
    model: 'claude-opus-4-5',
    max_tokens: 4096,
    messages: [{ role: 'user', content: userMessage }],
    system: systemPrompt,
  })

  const raw = message.content[0].type === 'text' ? message.content[0].text : ''
  const jsonMatch = raw.match(/\[[\s\S]*\]/)
  if (!jsonMatch) return NextResponse.json({ error: 'Failed to parse posts from LLM' }, { status: 500 })

  const posts: { content: string; image_url: string | null }[] = JSON.parse(jsonMatch[0])

  return NextResponse.json({ posts })
}
