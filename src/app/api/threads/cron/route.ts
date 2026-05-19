import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export const maxDuration = 60

/**
 * Called by Vercel Cron every 5 minutes.
 * Fetches all pending threads_posts where scheduled_at <= now() and publishes them.
 * Protected by CRON_SECRET — Vercel passes it automatically as Bearer token.
 */
export async function GET(request: NextRequest) {
  const authHeader = request.headers.get('authorization')
  const cronSecret = process.env.CRON_SECRET

  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const supabase = await createClient()

  // Fetch due posts via SECURITY DEFINER function (bypasses RLS)
  const { data: duePostsRaw, error } = await supabase.rpc('get_due_threads_posts')
  if (error) {
    console.error('[threads/cron] RPC error:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }

  const duePosts = duePostsRaw as {
    post_id: string
    user_id: string
    content: string
    image_url: string | null
    threads_user_id: string
    access_token: string
  }[] | null

  if (!duePosts || duePosts.length === 0) {
    return NextResponse.json({ published: 0 })
  }

  const base = 'https://graph.threads.net/v1.0'
  let published = 0
  let failed = 0

  for (const post of duePosts as {
    post_id: string
    user_id: string
    content: string
    image_url: string | null
    threads_user_id: string
    access_token: string
  }[]) {
    try {
      // Create container
      const params: Record<string, string> = {
        text: post.content,
        access_token: post.access_token,
        media_type: post.image_url ? 'IMAGE' : 'TEXT',
      }
      if (post.image_url) params.image_url = post.image_url

      const containerRes = await fetch(`${base}/${post.threads_user_id}/threads`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams(params),
      })
      const container = await containerRes.json()
      if (!container.id) throw new Error(`Container failed: ${JSON.stringify(container)}`)

      await new Promise(r => setTimeout(r, 1500))

      // Publish
      const publishRes = await fetch(`${base}/${post.threads_user_id}/threads_publish`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          creation_id: container.id,
          access_token: post.access_token,
        }),
      })
      const publishedData = await publishRes.json()
      if (!publishedData.id) throw new Error(`Publish failed: ${JSON.stringify(publishedData)}`)

      // Mark sent
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('threads_posts') as any)
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          threads_post_id: publishedData.id,
          error: null,
        })
        .eq('id', post.post_id)

      published++
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      console.error(`[threads/cron] Failed to publish post ${post.post_id}:`, message)
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('threads_posts') as any)
        .update({ status: 'failed', error: message })
        .eq('id', post.post_id)
      failed++
    }
  }

  console.log(`[threads/cron] published=${published} failed=${failed}`)
  return NextResponse.json({ published, failed })
}
