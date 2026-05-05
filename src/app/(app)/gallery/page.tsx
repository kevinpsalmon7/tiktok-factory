import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Images, Sparkles } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { GalleryCard } from './GalleryCard'

type CarouselRow = {
  id: string
  title: string
  prompt: string
  carousel_type: string
  status: string
  slides: { rendered_url?: string }[]
  created_at: string
}


export default async function GalleryPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: carousels } = await supabase
    .from('carousels')
    .select('id, title, prompt, carousel_type, status, slides, created_at')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .returns<CarouselRow[]>()

  const hasItems = carousels && carousels.length > 0

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-start justify-between">
        <div>
          <h1 className="font-display text-4xl font-semibold text-ink-900">Galerie</h1>
          <p className="text-ink-600 mt-2">
            Tous vos carousels générés, du plus récent au plus ancien.
          </p>
        </div>
        <Link
          href="/generate"
          className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 shadow-card"
        >
          <Sparkles size={14} />
          Nouveau
        </Link>
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {carousels.map((c) => (
            <GalleryCard
              key={c.id}
              id={c.id}
              title={c.title}
              carouselType={c.carousel_type}
              prompt={c.prompt}
              status={c.status}
              slides={c.slides}
              createdAt={c.created_at}
              formattedDate={formatDateTime(c.created_at)}
            />
          ))}
        </div>
      )}
    </div>
  )
}

