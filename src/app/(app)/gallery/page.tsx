import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Images, Sparkles } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

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
            <Link
              key={c.id}
              href={`/gallery/${c.id}`}
              className="group block"
            >
              <div className="aspect-[9/16] rounded-xl2 overflow-hidden bg-cream-100 relative shadow-soft group-hover:shadow-card transition">
                {c.slides?.[0]?.rendered_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.slides[0].rendered_url}
                    alt={c.prompt}
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ink-600/40">
                    <Images size={32} />
                  </div>
                )}
                <div className="absolute top-2 left-2">
                  <span className={`chip text-[10px] ${statusBadge(c.status)}`}>{c.status}</span>
                </div>
              </div>
              <div className="mt-2">
                <p className="text-sm text-ink-900 font-medium line-clamp-1">
                  {c.title || c.carousel_type || c.prompt || 'Sans titre'}
                </p>
                <p className="text-xs text-ink-600/60">{formatDateTime(c.created_at)}</p>
              </div>
            </Link>
          ))}
        </div>
      )}
    </div>
  )
}

function statusBadge(status: string): string {
  switch (status) {
    case 'completed':
      return 'bg-pastel-mint text-ink-900'
    case 'generating':
      return 'bg-pastel-lemon text-ink-900'
    case 'failed':
      return 'bg-pastel-pinkDeep text-white'
    default:
      return 'bg-white text-ink-700'
  }
}
