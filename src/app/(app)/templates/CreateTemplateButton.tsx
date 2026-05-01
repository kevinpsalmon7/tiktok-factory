'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Plus } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { defaultADHDTemplate } from '@/lib/default-template'

export function CreateTemplateButton({ variant = 'secondary' }: { variant?: 'primary' | 'secondary' }) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleCreate() {
    setLoading(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setLoading(false); return }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data, error } = await (supabase.from('templates') as any)
      .insert({
        user_id: user.id,
        name: defaultADHDTemplate.name,
        description: defaultADHDTemplate.description,
        layout: defaultADHDTemplate.layout,
        style_guide: defaultADHDTemplate.style_guide,
        carousel_instructions: defaultADHDTemplate.carousel_instructions,
        gemini_instructions: defaultADHDTemplate.gemini_instructions,
        platforms: defaultADHDTemplate.platforms,
      })
      .select('id')
      .single()

    setLoading(false)
    if (error) {
      console.error(error)
      return
    }
    router.push(`/templates/${data.id}`)
  }

  const classes =
    variant === 'primary'
      ? 'inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 disabled:opacity-50 shadow-card'
      : 'inline-flex items-center gap-2 px-4 py-2 bg-white border border-cream-200 text-ink-900 rounded-full text-sm font-medium hover:bg-cream-50 disabled:opacity-50 shadow-soft'

  return (
    <button onClick={handleCreate} disabled={loading} className={classes}>
      <Plus size={14} />
      {loading ? 'Création...' : 'Nouveau template'}
    </button>
  )
}
