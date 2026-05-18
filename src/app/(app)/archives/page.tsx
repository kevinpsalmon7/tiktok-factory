import { createClient } from '@/lib/supabase/server'
import { Archive } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { GalleryGrid } from '../gallery/GalleryGrid'

export default async function ArchivesPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: carousels } = await supabase
    .from('carousels')
    .select('id, title, prompt, carousel_type, status, slides, created_at, archived')
    .eq('user_id', user.id)
    .eq('archived', true)
    .order('created_at', { ascending: false })
    .returns<{ id: string; title: string; prompt: string; carousel_type: string; status: string; slides: { rendered_url?: string }[]; created_at: string; archived: boolean }[]>()

  const hasItems = carousels && carousels.length > 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-4xl font-semibold text-ink-900">Archives</h1>
        <p className="text-ink-600 mt-2">
          Your archived carousels. Restore them to find them back in the gallery.
        </p>
      </div>

      {!hasItems ? (
        <div className="bg-white rounded-xl2 p-12 shadow-soft text-center">
          <div className="inline-flex p-4 rounded-full bg-pastel-pink mb-4">
            <Archive size={32} className="text-ink-900" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 mb-2">
            No archived carousels
          </h2>
          <p className="text-ink-600 max-w-md mx-auto">
            Archive a carousel from the gallery to find it here.
          </p>
        </div>
      ) : (
        <GalleryGrid
          carousels={(carousels ?? []).map(c => ({
            ...c,
            formattedDate: formatDateTime(c.created_at),
          }))}
          mode="archives"
        />
      )}
    </div>
  )
}
