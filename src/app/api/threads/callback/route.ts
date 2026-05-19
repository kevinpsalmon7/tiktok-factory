import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function GET(request: NextRequest) {
  const { searchParams } = request.nextUrl
  const code = searchParams.get('code')
  const userId = searchParams.get('state')
  const error = searchParams.get('error')

  const appUrl = process.env.NEXT_PUBLIC_APP_URL!
  const redirectBase = `${appUrl}/threads`

  if (error || !code || !userId) {
    return NextResponse.redirect(`${redirectBase}?error=oauth_denied`)
  }

  const appId = process.env.THREADS_APP_ID!
  const appSecret = process.env.THREADS_APP_SECRET!
  const redirectUri = `${appUrl}/api/threads/callback`

  try {
    // 1. Exchange code for short-lived token
    const tokenRes = await fetch('https://graph.threads.net/oauth/access_token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({
        client_id: appId,
        client_secret: appSecret,
        grant_type: 'authorization_code',
        redirect_uri: redirectUri,
        code,
      }),
    })
    const tokenData = await tokenRes.json()
    if (!tokenData.access_token) {
      throw new Error(`Token exchange failed: ${JSON.stringify(tokenData)}`)
    }

    // 2. Exchange for long-lived token (valid 60 days)
    const longRes = await fetch(
      `https://graph.threads.net/access_token?grant_type=th_exchange_token&client_secret=${appSecret}&access_token=${tokenData.access_token}`
    )
    const longData = await longRes.json()
    const accessToken: string = longData.access_token || tokenData.access_token
    const expiresIn: number = longData.expires_in || 3600

    // 3. Get Threads user profile
    const meRes = await fetch(
      `https://graph.threads.net/me?fields=id,username&access_token=${accessToken}`
    )
    const me = await meRes.json()
    if (!me.id) throw new Error(`Profile fetch failed: ${JSON.stringify(me)}`)

    // 4. Upsert into threads_accounts
    const supabase = await createClient()
    const expiresAt = new Date(Date.now() + expiresIn * 1000).toISOString()

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error: dbError } = await (supabase.from('threads_accounts') as any).upsert(
      {
        user_id: userId,
        threads_user_id: me.id,
        username: me.username,
        access_token: accessToken,
        token_expires_at: expiresAt,
      },
      { onConflict: 'user_id,threads_user_id' }
    )
    if (dbError) throw new Error(dbError.message)

    return NextResponse.redirect(`${redirectBase}?connected=1`)
  } catch (err) {
    console.error('[threads/callback]', err)
    return NextResponse.redirect(`${redirectBase}?error=oauth_failed`)
  }
}
