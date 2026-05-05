'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Sparkles, ArrowRight } from 'lucide-react'

export function DashboardGenerateInput({ templates }: { templates: { id: string; name: string }[] }) {
  const router = useRouter()
  const [prompt, setPrompt] = useState('')
  const [templateId, setTemplateId] = useState(templates[0]?.id || '')

  function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    const params = new URLSearchParams()
    if (prompt.trim()) params.set('prompt', prompt.trim())
    if (templateId) params.set('templateId', templateId)
    router.push(`/generate?${params.toString()}`)
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-xl2 p-5 shadow-soft space-y-3">
      <textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        placeholder="Une idée, un thème, un angle… l'IA fait le reste."
        rows={2}
        className="textarea resize-none text-sm"
        onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSubmit(e as unknown as React.FormEvent) } }}
      />
      <div className="flex items-center gap-3">
        {templates.length > 1 && (
          <select
            value={templateId}
            onChange={e => setTemplateId(e.target.value)}
            className="flex-1 text-sm border border-cream-200 rounded-lg px-3 py-2 bg-cream-50 text-ink-700 focus:outline-none"
          >
            {templates.map(t => (
              <option key={t.id} value={t.id}>{t.name}</option>
            ))}
          </select>
        )}
        <button
          type="submit"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 shadow-card transition ml-auto"
        >
          <Sparkles size={13} />
          Générer
          <ArrowRight size={13} />
        </button>
      </div>
    </form>
  )
}
