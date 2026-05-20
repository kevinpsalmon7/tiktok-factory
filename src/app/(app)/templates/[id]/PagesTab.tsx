'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { UploadCloud, Trash2, Image as ImageIcon, Loader2, Star, Sparkles, X } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { compressImage, pLimit } from '@/lib/compressImage'
import type { TemplatePage } from '@/types/database'

type PagesTabProps = {
  templateId: string
  userId: string
  anthropicApiKey: string | null
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_MB = 15

export function PagesTab({ templateId, userId, anthropicApiKey: _anthropicApiKey }: PagesTabProps) {
  const [pages, setPages] = useState<TemplatePage[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const [editValue, setEditValue] = useState('')
  const [generatingId, setGeneratingId] = useState<string | null>(null)
  const [selecting, setSelecting] = useState(false)
  const [selected, setSelected] = useState<Set<string>>(new Set())
  const [deleting, setDeleting] = useState(false)
  const fileInputRef = useRef<HTMLInputElement>(null)

  const loadPages = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch(`/api/pages?templateId=${encodeURIComponent(templateId)}`)
      if (!res.ok) throw new Error('Erreur lors du chargement')
      const { pages: data } = await res.json()
      setPages(data || [])
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Erreur inconnue')
    } finally {
      setLoading(false)
    }
  }, [templateId])

  useEffect(() => {
    loadPages()
  }, [loadPages])

  async function handleFiles(files: FileList | File[]) {
    const fileArr = Array.from(files)
    setError(null)
    setUploading(true)
    setUploadProgress({ done: 0, total: fileArr.length })
    const supabase = createClient()

    // Pages call Claude to generate summaries — limit to 3 concurrent to avoid
    // hammering the Anthropic API and the browser's memory at the same time
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

        // Compress to WebP before upload (falls back to original if smaller)
        const compressed = await compressImage(file)

        // 1. Upload directly to Supabase Storage from the browser (no server body size limit)
        const ext = compressed.type === 'image/webp' ? 'webp' : (file.name.split('.').pop()?.toLowerCase() || 'jpg')
        const uuid = crypto.randomUUID()
        const storagePath = `${userId}/${templateId}/${uuid}.${ext}`

        const { error: uploadErr } = await supabase.storage
          .from('template-pages')
          .upload(storagePath, compressed, { contentType: compressed.type, upsert: false })

        if (uploadErr) {
          setError(`Erreur upload : ${uploadErr.message}`)
          setUploadProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null)
          return
        }

        // 2. Call API with just the storage path — no image payload
        const res = await fetch('/api/pages', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ templateId, storagePath, mimeType: compressed.type }),
        })
        if (!res.ok) {
          const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
          setError(body.error || "Erreur lors de l'analyse")
          // Clean up orphaned storage file
          await supabase.storage.from('template-pages').remove([storagePath])
        }

        setUploadProgress(prev => prev ? { ...prev, done: prev.done + 1 } : null)
      }),
      3, // max 3 concurrent — each triggers a Claude API call server-side
    )

    setUploading(false)
    setUploadProgress(null)
    await loadPages()
  }

  async function handleDelete(page: TemplatePage) {
    if (!confirm('Supprimer cette page ?')) return
    const res = await fetch(`/api/pages/${page.id}`, { method: 'DELETE' })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      setError(body.error || 'Erreur lors de la suppression')
      return
    }
    await loadPages()
  }

  async function handleSetDefault(page: TemplatePage) {
    if (page.is_default) return
    const res = await fetch(`/api/pages/${page.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ is_default: true }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      setError(body.error || 'Erreur')
      return
    }
    // Update state locally — no full reload
    setPages(prev => prev.map(p => ({ ...p, is_default: p.id === page.id })))
  }

  async function handleGenerateSummary(page: TemplatePage) {
    setGeneratingId(page.id)
    setError(null)
    try {
      const res = await fetch(`/api/pages/${page.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ regenerate: true }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
        setError(body.error || 'Erreur lors de la génération')
        return
      }
      const { page: updated } = await res.json()
      setPages(prev => prev.map(p => p.id === page.id ? { ...p, summary: updated.summary } : p))
    } finally {
      setGeneratingId(null)
    }
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
      fetch(`/api/pages/${id}`, { method: 'DELETE' })
    ))
    setPages(prev => prev.filter(p => !selected.has(p.id)))
    setDeleting(false)
    cancelSelection()
  }

  function startEdit(page: TemplatePage) {
    setEditingId(page.id)
    setEditValue(page.summary)
  }

  async function commitEdit(page: TemplatePage) {
    setEditingId(null)
    if (editValue === page.summary) return
    const res = await fetch(`/api/pages/${page.id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ summary: editValue }),
    })
    if (!res.ok) {
      const body = await res.json().catch(() => ({ error: `HTTP ${res.status}` }))
      setError(body.error || 'Erreur')
      await loadPages()
      return
    }
    setPages(prev => prev.map(p => p.id === page.id ? { ...p, summary: editValue } : p))
  }

  function handleDragOver(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(true)
  }
  function handleDragLeave(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
  }
  async function handleDrop(e: React.DragEvent) {
    e.preventDefault()
    e.stopPropagation()
    setDragOver(false)
    if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      await handleFiles(e.dataTransfer.files)
    }
  }

  const getPublicUrl = (storagePath: string) => {
    const projectRef = 'qwxqiksnuykmdpnxghok'
    return `https://${projectRef}.supabase.co/storage/v1/object/public/template-pages/${storagePath}`
  }

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-1">Pages de livre</h2>
      <p className="text-sm text-ink-600 mb-4">
        Importez des photos de pages de livre. Claude génère automatiquement un résumé pour
        chaque page. Lors de la génération, la page la plus pertinente sera utilisée comme
        fond du slide &laquo;&nbsp;pages&nbsp;&raquo;.
      </p>

      {/* Drop zone */}
      <label
        htmlFor="pages-file-input"
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        className={`border-2 border-dashed rounded-xl2 px-6 py-10 mb-4 cursor-pointer transition flex flex-col items-center gap-2 ${
          dragOver
            ? 'border-ink-900 bg-pastel-mint/40'
            : 'border-cream-200 hover:border-ink-900/40 bg-cream-50'
        }`}
      >
        {uploading ? (
          <Loader2 size={28} className="text-ink-700 animate-spin" />
        ) : (
          <UploadCloud size={28} className="text-ink-700" />
        )}
        <p className="text-sm font-medium text-ink-900">
          {uploading ? 'Upload et analyse en cours…' : 'Glisse tes pages ici'}
        </p>
        <p className="text-xs text-ink-600/70">
          ou clique pour choisir — JPG, PNG, WebP — max {MAX_SIZE_MB}MB
        </p>
        {uploading && uploadProgress && (
          <div className="w-full max-w-xs space-y-1.5">
            <div className="flex justify-between text-xs text-ink-600/70">
              <span>Claude génère les résumés…</span>
              <span className="font-medium text-ink-800">
                {uploadProgress.done}/{uploadProgress.total}
              </span>
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
          id="pages-file-input"
          ref={fileInputRef}
          type="file"
          accept={ACCEPTED_TYPES.join(',')}
          multiple
          className="hidden"
          onChange={(e) => {
            if (e.target.files && e.target.files.length > 0) {
              handleFiles(e.target.files)
            }
            e.target.value = ''
          }}
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
      ) : pages.length === 0 ? (
        <div className="text-center py-8 text-ink-600/60 text-sm">
          Aucune page importée pour le moment.
        </div>
      ) : (
        <>
        {/* Toolbar — same pattern as GalleryGrid */}
        <div className="flex items-center justify-between mb-4">
          {selecting ? (
            <>
              <span className="text-sm text-ink-600">
                {selected.size} sélectionnée{selected.size > 1 ? 's' : ''}
              </span>
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
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-4">
          {pages.map((page) => (
            <div
              key={page.id}
              className="group relative flex flex-col rounded-xl2 overflow-hidden bg-cream-100 shadow-soft hover:shadow-card transition"
            >
              {/* Thumbnail */}
              <div
                className={`relative aspect-[3/4] bg-cream-200 ${selecting ? 'cursor-pointer' : ''} ${selected.has(page.id) ? 'ring-4 ring-ink-900' : ''}`}
                onClick={selecting ? () => toggleSelect(page.id) : undefined}
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={getPublicUrl(page.storage_path)}
                  alt={page.summary || `Page ${page.position + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />

                {/* Selection overlay */}
                {selecting && selected.has(page.id) && (
                  <div className="absolute inset-0 bg-ink-900/30 flex items-center justify-center">
                    <div className="w-8 h-8 rounded-full bg-ink-900 flex items-center justify-center text-white text-lg font-bold">✓</div>
                  </div>
                )}

                {/* Default star badge */}
                <button
                  onClick={() => handleSetDefault(page)}
                  title={page.is_default ? 'Page par défaut' : 'Définir comme page par défaut'}
                  className={`absolute top-1.5 left-1.5 p-1.5 rounded-full transition ${
                    page.is_default
                      ? 'bg-pastel-lemon text-ink-900 shadow-soft'
                      : 'bg-white/80 text-ink-400 opacity-0 group-hover:opacity-100 hover:bg-pastel-lemon hover:text-ink-900'
                  }`}
                >
                  <Star size={12} className={page.is_default ? 'fill-ink-900' : ''} />
                </button>

                {/* Delete button */}
                <button
                  onClick={() => handleDelete(page)}
                  className="absolute top-1.5 right-1.5 p-1.5 bg-white/80 rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-red-50 hover:text-red-600"
                  title="Supprimer"
                >
                  <Trash2 size={12} />
                </button>
              </div>

              {/* Summary */}
              <div className="p-2 space-y-1.5">
                {editingId === page.id ? (
                  <textarea
                    autoFocus
                    value={editValue}
                    onChange={e => setEditValue(e.target.value)}
                    onBlur={() => commitEdit(page)}
                    onKeyDown={e => {
                      if (e.key === 'Enter' && !e.shiftKey) {
                        e.preventDefault()
                        commitEdit(page)
                      }
                      if (e.key === 'Escape') {
                        setEditingId(null)
                      }
                    }}
                    className="w-full text-xs text-ink-800 bg-white border border-ink-200 rounded-lg px-2 py-1.5 resize-none outline-none focus:ring-2 focus:ring-ink-900/10"
                    rows={3}
                  />
                ) : (
                  <button
                    onClick={() => startEdit(page)}
                    className="w-full text-left"
                    title="Cliquer pour modifier le résumé"
                  >
                    {page.summary ? (
                      <p className="text-xs text-ink-700 leading-relaxed">{page.summary}</p>
                    ) : (
                      <p className="text-xs text-ink-400 italic">Cliquer pour ajouter un résumé…</p>
                    )}
                  </button>
                )}
                {/* Generate summary button */}
                <button
                  onClick={() => handleGenerateSummary(page)}
                  disabled={generatingId === page.id}
                  title="Générer le résumé avec Claude"
                  className="flex items-center gap-1 text-[10px] text-ink-500 hover:text-ink-900 transition disabled:opacity-50"
                >
                  {generatingId === page.id
                    ? <Loader2 size={10} className="animate-spin" />
                    : <Sparkles size={10} />}
                  {generatingId === page.id ? 'Génération…' : 'Générer le résumé'}
                </button>
              </div>

              {/* Default label */}
              {page.is_default && (
                <div className="px-2 pb-2">
                  <span className="inline-flex items-center gap-1 text-[10px] font-medium text-ink-700 bg-pastel-lemon rounded-full px-2 py-0.5">
                    <Star size={9} className="fill-ink-700" />
                    Par défaut
                  </span>
                </div>
              )}
            </div>
          ))}
        </div>
        </>
      )}

      {pages.length > 0 && (
        <div className="mt-4 text-xs text-ink-600/60 flex items-center gap-2">
          <ImageIcon size={12} />
          {pages.length} page{pages.length > 1 ? 's' : ''} disponible{pages.length > 1 ? 's' : ''} — la plus pertinente est choisie automatiquement à la génération
        </div>
      )}
    </div>
  )
}
