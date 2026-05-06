import { createClient } from '@/lib/supabase/server'
import { SettingsForm } from './SettingsForm'

type ProfileRow = {
  full_name: string | null
  email: string | null
  avatar_url: string | null
  master_instructions: string
  avatar_instructions: string
  anthropic_api_key: string | null
  gemini_api_key: string | null
  openai_api_key: string | null
}

export default async function SettingsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: profile } = await supabase
    .from('profiles')
    .select('full_name, email, avatar_url, master_instructions, avatar_instructions, anthropic_api_key, gemini_api_key, openai_api_key')
    .eq('id', user.id)
    .single<ProfileRow>()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-4xl font-semibold text-ink-900">Paramètres</h1>
        <p className="text-ink-600 mt-2">
          Configurez votre profil, vos instructions et vos clés API.
        </p>
      </div>

      <SettingsForm
        initialProfile={{
          full_name: profile?.full_name ?? '',
          email: profile?.email ?? user.email ?? '',
          avatar_url: profile?.avatar_url ?? user.user_metadata?.avatar_url ?? '',
          master_instructions: profile?.master_instructions ?? '',
          avatar_instructions: profile?.avatar_instructions ?? '',
          anthropic_api_key: profile?.anthropic_api_key ?? '',
          gemini_api_key: profile?.gemini_api_key ?? '',
          openai_api_key: profile?.openai_api_key ?? '',
        }}
      />
    </div>
  )
}
