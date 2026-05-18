import { createClient } from '@/lib/supabase/server'
import { History } from 'lucide-react'
import { HistoryAccordion } from './HistoryAccordion'

type CarouselRow = {
  id: string
  title: string
  carousel_type: string
  prompt: string
  created_at: string
  slides: { index: number; slide_type: string; text_fields: Record<string, string> }[]
}

export default async function HistoriquePage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: carousels } = await supabase
    .from('carousels')
    .select('id, title, carousel_type, prompt, created_at, slides')
    .eq('user_id', user.id)
    .eq('status', 'completed')
    .order('created_at', { ascending: false })
    .returns<CarouselRow[]>()

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <div className="p-2.5 rounded-xl bg-pastel-lavender">
          <History size={20} className="text-ink-900" />
        </div>
        <div>
          <h1 className="font-display text-4xl font-semibold text-ink-900">History</h1>
          <p className="text-ink-600 mt-0.5 text-sm">
            All your carousels — text only.
          </p>
        </div>
      </div>

      <HistoryAccordion carousels={carousels || []} />
    </div>
  )
}
