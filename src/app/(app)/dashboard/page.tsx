import Link from 'next/link'
import { createClient } from '@/lib/supabase/server'
import { Sparkles, Images, LayoutTemplate, ArrowRight } from 'lucide-react'
import { formatDateTime } from '@/lib/utils'
import { DashboardGenerateInput } from './DashboardGenerateInput'

type RecentCarousel = {
  id: string
  prompt: string
  status: string
  created_at: string
  slides: { rendered_url?: string }[]
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return null

  const displayName =
    user.user_metadata?.full_name?.split(' ')[0] ||
    user.email?.split('@')[0] ||
    'Créateur'

  const [{ count: carouselsCount }, { count: templatesCount }, { data: recent }, { data: templates }] =
    await Promise.all([
      supabase.from('carousels').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase.from('templates').select('*', { count: 'exact', head: true }).eq('user_id', user.id),
      supabase
        .from('carousels')
        .select('id, prompt, status, created_at, slides')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(4)
        .returns<RecentCarousel[]>(),
      supabase
        .from('templates')
        .select('id, name')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .returns<{ id: string; name: string }[]>(),
    ])

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div className="space-y-4">
        <div>
          <h1 className="font-display text-5xl font-semibold text-ink-900 tracking-tight">
            Bon retour, {displayName}.
          </h1>
          <p className="text-ink-600 mt-2">
            Créez votre prochain carousel en quelques secondes.
          </p>
        </div>
        <DashboardGenerateInput templates={templates || []} />
      </div>

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <StatCard
          color="bg-pastel-pink"
          label="Carousels générés"
          value={carouselsCount ?? 0}
          icon={<Images size={18} />}
        />
        <StatCard
          color="bg-pastel-mint"
          label="Templates"
          value={templatesCount ?? 0}
          icon={<LayoutTemplate size={18} />}
        />
        <StatCard
          color="bg-pastel-lemon"
          label="Crédits IA"
          value="∞"
          icon={<Sparkles size={18} />}
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <Link
          href="/generate"
          className="lg:col-span-2 pastel-card bg-pastel-lavender flex items-start justify-between group"
        >
          <div>
            <div className="chip bg-white/50 text-ink-900 mb-3">
              <Sparkles size={12} />
              Générer
            </div>
            <h2 className="font-display text-3xl font-semibold text-ink-900 mb-2">
              Nouveau carousel
            </h2>
            <p className="text-ink-700 max-w-md">
              Tapez une idée, l&apos;IA génère le texte, les visuels et compose les slides pour vous.
            </p>
          </div>
          <ArrowRight size={24} className="text-ink-900 group-hover:translate-x-1 transition" />
        </Link>

        <Link
          href="/templates"
          className="pastel-card bg-pastel-peach flex flex-col justify-between"
        >
          <div>
            <div className="chip bg-white/50 text-ink-900 mb-3">
              <LayoutTemplate size={12} />
              Templates
            </div>
            <h3 className="font-display text-2xl font-semibold text-ink-900">
              Mes templates
            </h3>
          </div>
          <ArrowRight size={20} className="text-ink-900 self-end" />
        </Link>
      </div>

      <div className="bg-white rounded-xl2 p-6 shadow-soft">
        <div className="flex items-center justify-between mb-4">
          <h2 className="font-display text-xl font-semibold text-ink-900">
            Derniers carousels
          </h2>
          <Link href="/gallery" className="text-sm text-ink-600 hover:text-ink-900">
            Voir tout →
          </Link>
        </div>

        {!recent || recent.length === 0 ? (
          <div className="text-center py-12 text-ink-600/60">
            <p>Aucun carousel pour le moment.</p>
            <Link
              href="/generate"
              className="inline-flex items-center gap-2 mt-3 px-4 py-2 bg-ink-900 text-white rounded-full text-sm hover:bg-ink-800"
            >
              <Sparkles size={14} />
              Générer mon premier carousel
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
            {recent.map((c) => (
              <Link
                key={c.id}
                href={`/gallery/${c.id}`}
                className="aspect-[9/16] rounded-xl overflow-hidden bg-cream-100 relative group"
              >
                {c.slides?.[0]?.rendered_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={c.slides[0].rendered_url}
                    alt=""
                    className="w-full h-full object-cover"
                  />
                ) : (
                  <div className="w-full h-full flex items-center justify-center text-ink-600/40">
                    <LayoutTemplate size={32} />
                  </div>
                )}
                <div className="absolute bottom-0 left-0 right-0 p-2 bg-gradient-to-t from-ink-900/70 to-transparent text-white text-[10px]">
                  {formatDateTime(c.created_at)}
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

function StatCard({
  color,
  label,
  value,
  icon,
}: {
  color: string
  label: string
  value: string | number
  icon: React.ReactNode
}) {
  return (
    <div className={`pastel-card ${color} flex flex-col gap-3`}>
      <div className="flex items-center justify-between text-ink-900">
        <span className="text-xs font-medium tracking-wide">{label}</span>
        <div className="p-1.5 rounded-full bg-white/50">{icon}</div>
      </div>
      <div className="font-display text-4xl font-semibold text-ink-900">{value}</div>
    </div>
  )
}
