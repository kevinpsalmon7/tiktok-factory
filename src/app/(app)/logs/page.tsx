import { createClient } from '@/lib/supabase/server'
import { ScrollText } from 'lucide-react'
import { LogsViewer, type LogRow } from './LogsViewer'

export const dynamic = 'force-dynamic'

export default async function LogsPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: logs } = await supabase
    .from('generation_logs')
    .select('id, run_id, carousel_id, step, level, message, payload, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(2000)
    .returns<LogRow[]>()

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-pastel-lemon">
          <ScrollText size={20} className="text-ink-900" />
        </div>
        <div>
          <h1 className="font-display text-4xl font-semibold text-ink-900">Logs</h1>
          <p className="text-ink-600 mt-0.5 text-sm">
            Journal détaillé de chaque génération — prompts envoyés, réponses brutes, et chaque étape.
          </p>
        </div>
      </div>

      <LogsViewer logs={logs || []} />
    </div>
  )
}
