'use client'

import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { Copy } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type DuplicateTemplateButtonProps = {
  templateId: string
  templateName: string
}

export function DuplicateTemplateButton({ templateId, templateName }: DuplicateTemplateButtonProps) {
  const [loading, setLoading] = useState(false)
  const router = useRouter()

  async function handleDuplicate(e: React.MouseEvent) {
    // Prevent the parent <Link> from navigating to the template editor
    e.preventDefault()
    e.stopPropagation()

    if (loading) return
    setLoading(true)

    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    // Fetch the full source row — we copy every field except id / timestamps
    const { data: source, error: fetchErr } = await supabase
      .from('templates')
      .select('*')
      .eq('id', templateId)
      .eq('user_id', user.id)
      .single()

    if (fetchErr || !source) {
      console.error('Duplicate fetch failed', fetchErr)
      setLoading(false)
      return
    }

    // Strip immutable / server-managed fields so the insert generates fresh ones
    const sourceRow = source as Record<string, unknown>
    const { id: _id, created_at: _c, updated_at: _u, ...rest } = sourceRow
    void _id; void _c; void _u

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: inserted, error: insertErr } = await (supabase.from('templates') as any)
      .insert({
        ...rest,
        user_id: user.id,
        name: `${templateName} (copie)`,
      })
      .select('id')
      .single()

    setLoading(false)
    if (insertErr) {
      console.error('Duplicate insert failed', insertErr)
      return
    }

    // Refresh the list so the new card shows up
    router.refresh()
    // Navigate straight into the new template so the user can tweak it
    if (inserted?.id) router.push(`/templates/${inserted.id}`)
  }

  return (
    <button
      type="button"
      onClick={handleDuplicate}
      disabled={loading}
      title="Dupliquer ce template"
      aria-label="Dupliquer ce template"
      className="absolute top-3 right-3 inline-flex items-center justify-center w-8 h-8 rounded-full bg-white/90 backdrop-blur border border-cream-200 text-ink-700 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white shadow-soft disabled:opacity-50 z-10"
    >
      <Copy size={14} />
    </button>
  )
}
