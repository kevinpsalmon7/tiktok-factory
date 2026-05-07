import { createClient } from '@/lib/supabase/server'
import { Images } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { GalleryGrid } from './GalleryGrid'

export default async function GalleryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: carousels } = await supabase
    .from('carousels')
    .select('id, title, prompt, carousel_type, status, slides, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .returns<{ id: string; title: string; prompt: string; carousel_type: string; status: string; slides: { rendered_url?: string }[]; created_at: string }[]>()

  const hasItems = carousels && carousels.length > 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="font-display text-4xl font-semibold text-ink-900">Galerie</h1>
        <p className="text-ink-600 mt-2">
          Tous vos carousels générés, du plus récent au plus ancien.
        </p>
      </div>

      {!hasItems ? (
        <div className="bg-white rounded-xl2 p-12 shadow-soft text-center">
          <div className="inline-flex p-4 rounded-full bg-pastel-pink mb-4">
            <Images size={32} className="text-ink-900" />
          </div>
          <h2 className="font-display text-2xl font-semibold text-ink-900 mb-2">
            Galerie vide
          </h2>
          <p className="text-ink-600 max-w-md mx-auto">
            Générez votre premier carousel pour le voir apparaître ici.
          </p>
        </div>
      ) : (
        <GalleryGrid
          carousels={(carousels ?? []).map(c => ({
            ...c,
            formattedDate: formatDateTime(c.created_at),
          }))}
        />
      )}
    </div>
  )
}
