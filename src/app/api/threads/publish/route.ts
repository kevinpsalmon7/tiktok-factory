import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

async function publishToThreads(
  threadsUserId: string,
  accessToken: string,
  content: string,
  imageUrl?: string | null
): Promise<string> {
  const base = 'https://graph.threads.net/v1.0'

  // Step 1 — create container
  const params: Record<string, string> = {
    text: content,
    access_token: accessToken,
    media_type: imageUrl ? 'IMAGE' : 'TEXT',
  }
  if (imageUrl) params.image_url = imageUrl

  const containerRes = await fetch(`${base}/${threadsUserId}/threads`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams(params),
  })
  const container = await containerRes.json()
  if (!container.id) throw new Error(`Container creation failed: ${JSON.stringify(container)}`)

  // Brief pause — Threads requires container to be ready before publishing
  await new Promise(r => setTimeout(r, 1500))

  // Step 2 — publish
  const publishRes = await fetch(`${base}/${threadsUserId}/threads_publish`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      creation_id: container.id,
      access_token: accessToken,
    }),
  })
  const published = await publishRes.json()
  if (!published.id) throw new Error(`Publish failed: ${JSON.stringify(published)}`)

  return published.id
}

export async function POST(request: NextRequest) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const { postId } = await request.json()
  if (!postId) return NextResponse.json({ error: 'postId required' }, { status: 400 })

  // Fetch post + account
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: post, error: postErr } = await (supabase.from('threads_posts') as any)
    .select('*, threads_accounts(threads_user_id, access_token)')
    .eq('id', postId)
    .eq('user_id', user.id)
    .single()

  if (postErr || !post) return NextResponse.json({ error: 'Post not found' }, { status: 404 })
  if (post.status === 'sent') return NextResponse.json({ error: 'Already sent' }, { status: 400 })

  const account = post.threads_accounts
  try {
    const threadsPostId = await publishToThreads(
      account.threads_user_id,
      account.access_token,
      post.content,
      post.image_url
    )

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('threads_posts') as any)
      .update({ status: 'sent', sent_at: new Date().toISOString(), threads_post_id: threadsPostId, error: null })
      .eq('id', postId)

    return NextResponse.json({ ok: true, threadsPostId })
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err)
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('threads_posts') as any)
      .update({ status: 'failed', error: message })
      .eq('id', postId)
    return NextResponse.json({ error: message }, { status: 500 })
  }
}
