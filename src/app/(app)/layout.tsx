import { redirect } from 'next/navigation'
import { createClient } from '@/lib/supabase/server'
import { Sidebar } from '@/components/Sidebar'
import { TopBar } from '@/components/TopBar'

export default async function AppLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, avatar_url')
    .eq('id', user.id)
    .single<{ full_name: string | null; avatar_url: string | null }>()

  const displayName = profile?.full_name || user.email?.split('@')[0] || null
  const avatarUrl = profile?.avatar_url || user.user_metadata?.avatar_url || null

  return (
    <div className="h-screen flex bg-cream-50 overflow-hidden">
      <Sidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <TopBar avatarUrl={avatarUrl} userName={displayName} />
        <main className="flex-1 overflow-y-auto px-6 pb-6">{children}</main>
      </div>
    </div>
  )
}
