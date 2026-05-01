'use client'

import { createClient } from '@/lib/supabase/client'
import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { Mail, Lock, Loader2 } from 'lucide-react'

type Mode = 'signin' | 'signup'

export default function LoginPage() {
  const router = useRouter()
  const [mode, setMode] = useState<Mode>('signin')
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError(null)
    setInfo(null)

    const supabase = createClient()
    if (mode === 'signin') {
      const { error } = await supabase.auth.signInWithPassword({ email, password })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      router.push('/dashboard')
      router.refresh()
    } else {
      const { error, data } = await supabase.auth.signUp({
        email,
        password,
        options: { emailRedirectTo: `${window.location.origin}/auth/callback` },
      })
      if (error) {
        setError(error.message)
        setLoading(false)
        return
      }
      // If email confirmation is disabled, the user has a session immediately
      if (data.session) {
        router.push('/dashboard')
        router.refresh()
      } else {
        setInfo('Compte créé. Vérifiez votre email pour confirmer.')
        setLoading(false)
      }
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center bg-cream-50 p-6">
      <div className="w-full max-w-md">
        <div className="text-center mb-8">
          <h1 className="font-display text-4xl font-semibold text-ink-900 mb-2">
            Tiktok Factory
          </h1>
          <p className="text-ink-600 text-sm">
            Générez vos carousels TikTok et Instagram en un clic
          </p>
        </div>

        <div className="bg-white rounded-xl2 p-8 shadow-card">
          <div className="flex gap-1 bg-cream-100 rounded-full p-1 mb-6">
            <button
              onClick={() => { setMode('signin'); setError(null); setInfo(null) }}
              className={`flex-1 py-2 text-sm font-medium rounded-full transition ${
                mode === 'signin' ? 'bg-white shadow-soft text-ink-900' : 'text-ink-600'
              }`}
            >
              Connexion
            </button>
            <button
              onClick={() => { setMode('signup'); setError(null); setInfo(null) }}
              className={`flex-1 py-2 text-sm font-medium rounded-full transition ${
                mode === 'signup' ? 'bg-white shadow-soft text-ink-900' : 'text-ink-600'
              }`}
            >
              Inscription
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-3">
            <div>
              <label className="text-xs text-ink-600 mb-1 block">Email</label>
              <div className="relative">
                <Mail size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-600/50" />
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  className="input pl-9"
                  placeholder="vous@email.com"
                />
              </div>
            </div>
            <div>
              <label className="text-xs text-ink-600 mb-1 block">Mot de passe</label>
              <div className="relative">
                <Lock size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-ink-600/50" />
                <input
                  type="password"
                  required
                  minLength={6}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="input pl-9"
                  placeholder="••••••••"
                />
              </div>
            </div>

            {error && (
              <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg">
                {error}
              </div>
            )}
            {info && (
              <div className="text-xs text-ink-700 bg-pastel-mint px-3 py-2 rounded-lg">
                {info}
              </div>
            )}

            <button
              type="submit"
              disabled={loading}
              className="w-full inline-flex items-center justify-center gap-2 px-4 py-3 bg-ink-900 text-white rounded-xl font-medium hover:bg-ink-800 disabled:opacity-50 transition"
            >
              {loading && <Loader2 size={14} className="animate-spin" />}
              {mode === 'signin' ? 'Se connecter' : 'Créer mon compte'}
            </button>
          </form>
        </div>
      </div>
    </main>
  )
}
