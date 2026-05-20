'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { UploadCloud, Trash2, Image as ImageIcon, Loader2, X, ZoomIn } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { compressImage, pLimit } from '@/lib/compressImage'

type Background = {
  id: string
  template_id: string
  user_id: string
  storage_path: string
  name: string
  is_default: boolean
  created_at: string
}

type BackgroundsTabProps = {
  templateId: string
  userId: string
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_MB = 15
const PROJECT_REF = 'qwxqiksnuykmdpnxghok'

function getPublicUrl(storagePath: string) {
  return `https://${PROJECT_REF}.supabase.co/storage/v1/object/public/template-backgrounds/${storagePath}`
}

export function BackgroundsTab({ templateId, userId }: BackgroundsTabProps) {
  const [backgrounds, setBackgrounds] = useState<Background[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const [lightbox, setLightbox] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadBackgrounds = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/backgrounds?templateId=${encodeURIComponent(templateId)}`)
      if (!res.ok) throw new Error('Erreur lors du chargement')
      const { backgrounds: data } = await res.json()
      setBackgrounds(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [templateId])

  useEffect(() => {
    loadBackgrounds()
  }, [loadBackgrounds])

  // Close lightbox on Escape
  useEffect(() => {
    if (!lightbox) return
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') setLightbox(null) }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [lightbox])

  async function handleFiles(files: FileList | File[]) {
    const fileArr = Array.from(files)
    setError(null)
    setUploading(true)
    setUploadProgress({ done: 0, total: fileArr.length })
    const supabase = createClient()

    await pLimit(
      fileArr.map((file) => async () => {
        if (!ACCEPTED_TYPES.includes(file.type)) {
          setError(`Type non supporté : ${file.name}`)
          setUploadProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null)
          return
        }
        if (file.size > MAX_SIZE_MB * 1024 * 1024) {
          setError(`Fichier trop grand : ${file.name} (>${MAX_SIZE_MB}MB)`)
          setUploadProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null)
          return
        }

        const compressed = await compressImage(file)
        const ext = compressed.type === 'image/webp' ? 'webp' : (file.name.split('.').pop()?.toLowerCase() || 'jpg')
        const uuid = crypto.randomUUID()
        const storagePath = `${userId}/${templateId}/${uuid}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('template-backgrounds')
          .upload(storagePath, compressed, { contentType: compressed.type, upsert: false })

        if (uploadErr) {
          setError(`Erreur upload : ${uploadErr.message}`)
          setUploadProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null)
          return
        }

        const res = await fetch('/api/backgrounds', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, storagePath, name: file.name.replace(/\.[^.]+$/, '') }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          setError(body.error || "Erreur lors de l'enregistrement")
          await supabase.storage.from('template-backgrounds').remove([storagePath])
        }

        setUploadProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null)
      }),
      4,
    )

    setUploading(false)
    setUploadProgress(null)
    await loadBackgrounds()
  }

  async function handleDelete(bg: Background) {
    if (!confirm('Supprimer ce background ?')) return
    const res = await fetch(`/api/backgrounds/${bg.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      setError(body.error || 'Erreur lors de la suppression')
      return
    }
    setBackgrounds(prev => prev.filter(b => b.id !== bg.id))
  }

  function toggleSelect(id: string) {
    setSelected(prev => {
      const next = new Set(prev)
      next.has(id) ? next.delete(id) : next.add(id)
      return next
    })
  }

  function cancelSelection() {
    setSelecting(false)
    setSelected(new Set())
  }

  async function handleDeleteSelected() {
    if (selected.size === 0) return
    setDeleting(true)
    setError(null)
    await Promise.all([...selected].map(id =>
      fetch(`/api/backgrounds/${id}`, { method: 'DELETE' })
    ))
    setBackgrounds(prev => prev.filter(b => !selected.has(b.id)))
    setDeleting(false)
    cancelSelection()
  }

  function handleDragOver(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); setDragOver(true) }
  function handleDragLeave(e: React.DragEvent) { e.preventDefault(); e.stopPropagation(); setDragOver(false) }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault(); e.stopPropagation(); setDragOver(false)
    if (e.dataTransfer.files?.length) await handleFiles(e.dataTransfer.files)
  }

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-1">Backgrounds</h2>
      <p className="text-sm text-ink-600 mb-4">
        Importez des images à utiliser comme fond de vos slides carrousel.
      </p>

      {/* Drop zone */}
      <label
        htmlFor="backgrounds-file-input"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl2 px-6 py-10 mb-4 cursor-pointer transition flex flex-col items-center gap-2 ${
          dragOver ? 'border-ink-900 bg-pastel-mint/40' : 'border-cream-200 hover:border-ink-900/40 bg-cream-50'
        }`}
      >
        {uploading ? <Loader2 size={28} className="text-ink-700 animate-spin" /> : <UploadCloud size={28} className="text-ink-700" />}
        <p className="text-sm font-medium text-ink-900">
          {uploading ? 'Upload en cours…' : 'Glisse tes backgrounds ici'}
        </p>
        <p className="text-xs text-ink-600/70">ou clique pour choisir — JPG, PNG, WebP — max {MAX_SIZE_MB}MB</p>
        {uploading && uploadProgress && (
          <div className="w-full max-w-xs space-y-1.5">
            <div className="flex justify-between text-xs text-ink-600/70">
              <span>Upload en cours…</span>
              <span className="font-medium text-ink-800">{uploadProgress.done}/{uploadProgress.total}</span>
            </div>
            <div className="h-1.5 w-full bg-cream-200 rounded-full overflow-hidden">
              <div
                className="h-full bg-ink-900 rounded-full transition-all duration-300"
                style={{ width: `${Math.round((uploadProgress.done / uploadProgress.total) * 100)}%` }}
              />
            </div>
          </div>
        )}
        <input
          id="backgrounds-file-input"
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={(e) => { if (e.target.files?.length) handleFiles(e.target.files); e.target.value = '' }}
        />
      </label>

      {error && (
        <div className="text-xs text-red-600 bg-red-50 px-3 py-2 rounded-lg mb-3 flex items-start justify-between gap-2">
          <span>{error}</span>
          <button onClick={() => setError(null)} className="font-medium shrink-0">✕</button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-ink-600/60 text-sm">Chargement…</div>
      ) : backgrounds.length === 0 ? (
        <div className="text-center py-8 text-ink-600/60 text-sm">Aucun background importé pour le moment.</div>
      ) : (
        <>
          {/* Toolbar */}
          <div className="flex items-center justify-between mb-4">
            {selecting ? (
              <>
                <span className="text-sm text-ink-600">{selected.size} sélectionné{selected.size > 1 ? 's' : ''}</span>
                <div className="flex gap-2">
                  {selected.size > 0 && (
                    <button
                      onClick={handleDeleteSelected}
                      disabled={deleting}
                      className="inline-flex items-center gap-2 px-4 py-2 bg-red-500 text-white rounded-full text-sm font-medium hover:bg-red-600 disabled:opacity-50 shadow-card"
                    >
                      <Trash2 size={13} />
                      {deleting ? 'Suppression…' : `Supprimer (${selected.size})`}
                    </button>
                  )}
                  <button
                    onClick={cancelSelection}
                    className="inline-flex items-center gap-2 px-4 py-2 bg-cream-100 text-ink-700 rounded-full text-sm font-medium hover:bg-cream-200"
                  >
                    <X size={13} />
                    Annuler
                  </button>
                </div>
              </>
            ) : (
              <button
                onClick={() => setSelecting(true)}
                className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 shadow-card"
              >
                Sélectionner
              </button>
            )}
          </div>

          {/* Grid — smaller thumbnails, more columns */}
          <div className="grid grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-2">
            {backgrounds.map((bg) => {
              const url = getPublicUrl(bg.storage_path)
              return (
                <div
                  key={bg.id}
                  className={`group relative rounded-lg overflow-hidden bg-cream-200 shadow-soft hover:shadow-card transition cursor-pointer aspect-[9/16] ${
                    selected.has(bg.id) ? 'ring-2 ring-ink-900' : ''
                  }`}
                  onClick={() => selecting ? toggleSelect(bg.id) : setLightbox(url)}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={url}
                    alt="Background"
                    className="w-full h-full object-cover"
                    draggable={false}
                  />

                  {/* Selection overlay */}
                  {selecting && selected.has(bg.id) && (
                    <div className="absolute inset-0 bg-ink-900/30 flex items-center justify-center">
                      <div className="w-6 h-6 rounded-full bg-ink-900 flex items-center justify-center text-white text-xs font-bold">✓</div>
                    </div>
                  )}

                  {/* Hover actions (not in select mode) */}
                  {!selecting && (
                    <div className="absolute inset-0 bg-ink-900/0 group-hover:bg-ink-900/20 transition flex items-start justify-between p-1">
                      <button
                        onClick={(e) => { e.stopPropagation(); setLightbox(url) }}
                        className="p-1 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-white"
                        title="Agrandir"
                      >
                        <ZoomIn size={10} />
                      </button>
                      <button
                        onClick={(e) => { e.stopPropagation(); handleDelete(bg) }}
                        className="p-1 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-red-50 hover:text-red-600"
                        title="Supprimer"
                      >
                        <Trash2 size={10} />
                      </button>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </>
      )}

      {backgrounds.length > 0 && (
        <div className="mt-4 text-xs text-ink-600/60 flex items-center gap-2">
          <ImageIcon size={12} />
          {backgrounds.length} background{backgrounds.length > 1 ? 's' : ''}
        </div>
      )}

      {/* Lightbox */}
      {lightbox && (
        <div
          className="fixed inset-0 z-50 bg-ink-900/80 flex items-center justify-center p-4"
          onClick={() => setLightbox(null)}
        >
          <button
            className="absolute top-4 right-4 p-2 bg-white/10 hover:bg-white/20 rounded-full text-white transition"
            onClick={() => setLightbox(null)}
          >
            <X size={20} />
          </button>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightbox}
            alt="Background"
            className="max-h-[90vh] max-w-[90vw] rounded-xl object-contain shadow-2xl"
            onClick={(e) => e.stopPropagation()}
            draggable={false}
          />
        </div>
      )}
    </div>
  )
}
