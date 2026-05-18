import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { LayoutTemplate } from 'lucide-react'
import { formatDate } from '@/lib/utils'
import { CreateTemplateButton } from './CreateTemplateButton'
import { DuplicateTemplateButton } from './DuplicateTemplateButton'

type TemplateRow = {
  id: string
  name: string
  description: string
  platforms: string[]
  updated_at: string
}

export default async function TemplatesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: templates } = await supabase
    .from('templates')
    .select('id, name, description, platforms, updated_at')
    .eq('user_id', user.id)
    .order('updated_at', { ascending: false })
    .returns<TemplateRow[]>()

  const hasTemplates = templates && templates.length > 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-4xl font-semibold text-ink-900">Templates</h1>
          <p className="text-ink-600 mt-2">
            Build your visual templates with a drag &amp; drop editor.
          </p>
        </div>
        <CreateTemplateButton />
      </div>

      {!hasTemplates ? (
        <div className="bg-white rounded-xl2 p-12 shadow-soft text-center">
          <div className="inline-flex p-4 rounded-full bg-pastel-mint mb-4">
            <LayoutTemplate size={32} className="text-ink-900" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 mb-2">
            No templates yet
          </h2>
          <p className="text-ink-600 mb-6 max-w-md mx-auto">
            Create your first template from scratch, or use the ADHD Or Just Me
            model to get started quickly.
          </p>
          <CreateTemplateButton variant="primary" />
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {templates.map((t) => (
            <Link
              key={t.id}
              href={`/templates/${t.id}`}
              className="pastel-card bg-white hover:bg-cream-50 flex flex-col gap-3 group relative"
            >
              <DuplicateTemplateButton templateId={t.id} templateName={t.name} />
              <div className="aspect-[9/16] rounded-xl bg-cream-100 flex items-center justify-center">
                <LayoutTemplate size={48} className="text-ink-600/30" />
              </div>
              <div>
                <h3 className="font-display text-xl font-semibold text-ink-900">
                  {t.name}
                </h3>
                {t.description && (
                  <p className="text-sm text-ink-600 mt-1 line-clamp-2">{t.description}</p>
                )}
                <div className="flex items-center gap-2 mt-3">
                  {t.platforms.map((p) => (
                    <span key={p} className="chip bg-cream-100 text-ink-700 text-[10px]">
                      {p}
                    </span>
                  ))}
                  <span className="ml-auto text-xs text-ink-600/50">
                    {formatDate(t.updated_at)}
                  </span>
                </div>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}
