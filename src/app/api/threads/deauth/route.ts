import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Called by Meta when a user revokes access to the app from their Threads settings.
// Deletes the corresponding threads_account row.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const threadsUserId = body?.user_id ? String(body.user_id) : null
    if (threadsUserId) {
      const supabase = await createClient()
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('threads_accounts') as any)
        .delete()
        .eq('threads_user_id', threadsUserId)
    }
  } catch { /* best-effort */ }
  return NextResponse.json({ ok: true })
}
