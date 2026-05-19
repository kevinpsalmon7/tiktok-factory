import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  const appId = process.env.THREADS_APP_ID!
  const redirectUri = `${process.env.NEXT_PUBLIC_APP_URL}/api/threads/callback`
  const scope = 'threads_basic,threads_content_publish'

  const url = new URL('https://threads.net/oauth/authorize')
  url.searchParams.set('client_id', appId)
  url.searchParams.set('redirect_uri', redirectUri)
  url.searchParams.set('scope', scope)
  url.searchParams.set('response_type', 'code')
  url.searchParams.set('state', user.id)

  return NextResponse.redirect(url.toString())
}
