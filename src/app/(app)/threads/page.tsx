import { createClient } from '@/lib/supabase/server'
import { ThreadsClient } from './ThreadsClient'

export default async function ThreadsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: accounts } = await (supabase.from('threads_accounts') as any)
    .select('id, username, instructions, token_expires_at, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: true })

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { data: images } = await (supabase.from('threads_images') as any)
    .select('id, url, name, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })

  return <ThreadsClient initialAccounts={accounts || []} initialImages={images || []} />
}
