import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

// Called by Meta when a user requests deletion of their data.
// Deletes all threads data for that user.
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}))
    const threadsUserId = body?.user_id ? String(body.user_id) : null
    if (threadsUserId) {
      const supabase = await createClient()
      // Find account row to get our internal account id
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { data: account } = await (supabase.from('threads_accounts') as any)
        .select('id, user_id')
        .eq('threads_user_id', threadsUserId)
        .single()
      if (account) {
        // Cascade deletes posts too (FK on delete cascade)
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        await (supabase.from('threads_accounts') as any)
          .delete()
          .eq('id', account.id)
      }
    }
  } catch { /* best-effort */ }

  // Meta expects a confirmation_code in the response
  return NextResponse.json({
    url: `${process.env.NEXT_PUBLIC_APP_URL}/privacy`,
    confirmation_code: `del_${Date.now()}`,
  })
}
