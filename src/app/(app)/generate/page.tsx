import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { GenerateForm } from './GenerateForm'
import { LayoutTemplate } from 'lucide-react'
import type { TemplateLayout } from '@/types/database'

type TemplateRow = {
  id: string
  name: string
  layout: TemplateLayout
}

export default async function GeneratePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: templates } = await supabase
    .from('templates')
    .select('id, name, layout')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .returns<TemplateRow[]>()

  if (!templates || templates.length === 0) {
    return (
      <div className="max-w-2xl mx-auto mt-12 bg-white rounded-xl2 p-12 shadow-soft text-center">
        <div className="inline-flex p-4 rounded-full bg-pastel-lavender mb-4">
          <LayoutTemplate size={32} className="text-ink-900" />
        </div>
        <h2 className="font-display text-2xl font-semibold text-ink-900 mb-2">
          Aucun template
        </h2>
        <p className="text-ink-600 mb-6">
          Créez un template avant de générer votre premier carousel.
        </p>
        <Link
          href="/templates"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800"
        >
          Aller aux templates
        </Link>
      </div>
    )
  }

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-4xl font-semibold text-ink-900">Générer</h1>
        <p className="text-ink-600 mt-2">
          Décrivez votre idée, choisissez un template, l&apos;IA fait le reste.
        </p>
      </div>

      <GenerateForm templates={templates} />
    </div>
  )
}
