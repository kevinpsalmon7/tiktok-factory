import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { notFound } from 'next/navigation'
import { ArrowLeft, Download } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'

type CarouselRow = {
  id: string
  prompt: string
  carousel_type: string
  status: string
  slides: { index: number; slide_type: string; text_fields: Record<string, string>; rendered_url?: string }[]
  created_at: string
}

export default async function CarouselDetailPage({
  params,
}: {
  params: Promise<{ id: string }>
}) {
  const { id } = await params
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const { data: carousel } = await supabase
    .from('carousels')
    .select('id, prompt, carousel_type, status, slides, created_at')
    .eq('id', id)
    .eq('user_id', user.id)
    .single<CarouselRow>()

  if (!carousel) notFound()

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="flex items-center gap-3">
        <Link href="/gallery" className="p-2 rounded-full bg-white shadow-soft hover:shadow-card">
          <ArrowLeft size={16} />
        </Link>
        <div>
          <h1 className="font-display text-3xl font-semibold text-ink-900">
            {carousel.carousel_type || 'Carousel'}
          </h1>
          <p className="text-xs text-ink-600/60">{formatDateTime(carousel.created_at)}</p>
        </div>
      </div>

      {carousel.prompt && (
        <div className="bg-white rounded-xl2 p-4 shadow-soft">
          <p className="text-sm text-ink-700 italic">&ldquo;{carousel.prompt}&rdquo;</p>
        </div>
      )}

      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
        {carousel.slides.map((s) => (
          <div key={s.index} className="space-y-2">
            <div className="aspect-[9/16] rounded-xl2 overflow-hidden bg-cream-100 shadow-soft relative">
              {s.rendered_url ? (
                <>
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={s.rendered_url} alt={`Slide ${s.index}`} className="w-full h-full object-cover" />
                  <a
                    href={s.rendered_url}
                    download={`slide-${s.index}.jpg`}
                    className="absolute top-2 right-2 p-2 bg-white/90 rounded-full hover:bg-white"
                  >
                    <Download size={14} />
                  </a>
                </>
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-600/40 text-xs">
                  Slide {s.index}
                </div>
              )}
            </div>
            <p className="text-[10px] text-ink-600 text-center">
              {s.index}. {s.slide_type}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
