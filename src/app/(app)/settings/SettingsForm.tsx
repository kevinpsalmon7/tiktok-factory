'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { Save, KeyRound, User, UserCircle } from 'lucide-react'
import Image from 'next/image'

type ProfileForm = {
  full_name: string
  email: string
  avatar_url: string
  anthropic_api_key: string
  gemini_api_key: string
  openai_api_key: string
}

export function SettingsForm({ initialProfile }: { initialProfile: ProfileForm }) {
  const [profile, setProfile] = useState(initialProfile)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  function update<K extends keyof ProfileForm>(key: K, value: ProfileForm[K]) {
    setProfile((p) => ({ ...p, [key]: value }))
    setSaved(false)
  }

  async function handleSave() {
    setSaving(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const updates = {
      full_name: profile.full_name,
      anthropic_api_key: profile.anthropic_api_key || null,
      gemini_api_key: profile.gemini_api_key || null,
      openai_api_key: profile.openai_api_key || null,
    }
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { error } = await (supabase.from('profiles') as any)
      .update(updates)
      .eq('id', user.id)

    setSaving(false)
    if (!error) {
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    }
  }

  return (
    <div className="space-y-4">
      <Section title="Profile" icon={<User size={16} />} color="bg-pastel-pink">
        <div className="flex items-center gap-4">
          {profile.avatar_url ? (
            <Image
              src={profile.avatar_url}
              alt={profile.full_name}
              width={64}
              height={64}
              className="rounded-full"
            />
          ) : (
            <div className="w-16 h-16 rounded-full bg-pastel-lavender flex items-center justify-center text-ink-900">
              <UserCircle size={32} />
            </div>
          )}
          <div className="flex-1">
            <label className="text-xs text-ink-600 mb-1 block">Display name</label>
            <input
              className="input"
              value={profile.full_name}
              onChange={(e) => update('full_name', e.target.value)}
              placeholder="Your name"
            />
          </div>
        </div>
        <div className="mt-3">
          <label className="text-xs text-ink-600 mb-1 block">Email address</label>
          <input
            className="input bg-cream-50 text-ink-600"
            value={profile.email}
            disabled
          />
        </div>
      </Section>

      <Section
        title="API Keys"
        icon={<KeyRound size={16} />}
        color="bg-pastel-lavender"
        description="Required for generation. Never displayed after saving."
      >
        <div className="space-y-3">
          <div>
            <label className="text-xs text-ink-600 mb-1 block">Anthropic (Claude)</label>
            <input
              className="input font-mono text-xs"
              type="password"
              value={profile.anthropic_api_key}
              onChange={(e) => update('anthropic_api_key', e.target.value)}
              placeholder="sk-ant-..."
            />
          </div>
          <div>
            <label className="text-xs text-ink-600 mb-1 block">OpenAI (gpt-image-2)</label>
            <input
              className="input font-mono text-xs"
              type="password"
              value={profile.openai_api_key}
              onChange={(e) => update('openai_api_key', e.target.value)}
              placeholder="sk-proj-..."
            />
          </div>
          <div>
            <label className="text-xs text-ink-600 mb-1 block">Google Gemini <span className="text-ink-400">(not used yet)</span></label>
            <input
              className="input font-mono text-xs"
              type="password"
              value={profile.gemini_api_key}
              onChange={(e) => update('gemini_api_key', e.target.value)}
              placeholder="AIza..."
            />
          </div>
        </div>
      </Section>

      <div className="sticky bottom-4 flex justify-end gap-2 z-10">
        {saved && (
          <div className="px-4 py-2.5 rounded-full bg-pastel-mint text-ink-900 text-sm font-medium shadow-card">
            ✓ Saved
          </div>
        )}
        <button
          onClick={handleSave}
          disabled={saving}
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 disabled:opacity-50 shadow-card"
        >
          <Save size={14} />
          {saving ? 'Saving...' : 'Save'}
        </button>
      </div>
    </div>
  )
}

function Section({
  title,
  icon,
  color,
  description,
  children,
}: {
  title: string
  icon: React.ReactNode
  color: string
  description?: string
  children: React.ReactNode
}) {
  return (
    <div className="bg-white rounded-xl2 p-6 shadow-soft">
      <div className="flex items-center gap-3 mb-1">
        <div className={`p-2 rounded-lg ${color}`}>{icon}</div>
        <h2 className="font-display text-xl font-semibold text-ink-900">{title}</h2>
      </div>
      {description && <p className="text-sm text-ink-600 mb-4 ml-10">{description}</p>}
      <div className={description ? '' : 'mt-3'}>{children}</div>
    </div>
  )
}
