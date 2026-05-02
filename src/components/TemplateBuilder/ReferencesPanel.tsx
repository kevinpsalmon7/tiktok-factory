'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { UploadCloud, Trash2, Image as ImageIcon, Loader2, GripVertical } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'

type ReferenceItem = {
  id: string
  storage_path: string
  position: number
  signedUrl: string
}

const ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp']
const MAX_SIZE_MB = 10
const SIGNED_URL_TTL = 3600 // 1h — plenty for a builder session

export function ReferencesPanel({ templateId }: { templateId: string }) {
  const [items, setItems] = useState<ReferenceItem[]>([])
  const [loading, setLoading] = useState(true)
  const [uploading, setUploading] = useState(false)
  const [dragOver, setDragOver] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const fileInputRef = useRef<HTMLInputElement>(null)
  const dragItemId = useRef<string | null>(null)

  const supabase = createClient()

  const loadItems = useCallback(async () => {
    setLoading(true)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setLoading(false)
      return
    }

    const { data, error: listErr } = await supabase
      .from('template_references')
      .select('id, storage_path, position')
      .eq('template_id', templateId)
      .eq('user_id', user.id)
      .order('position', { ascending: true })
      .returns<{ id: string; storage_path: string; position: number }[]>()

    if (listErr) {
      setError(listErr.message)
      setLoading(false)
      return
    }

    if (!data || data.length === 0) {
      setItems([])
      setLoading(false)
      return
    }

    // Bucket is private — request signed URLs
    const paths = data.map((d) => d.storage_path)
    const { data: signed, error: signErr } = await supabase.storage
      .from('template-references')
      .createSignedUrls(paths, SIGNED_URL_TTL)

    if (signErr) {
      setError(signErr.message)
      setLoading(false)
      return
    }

    const signedByPath = new Map<string, string>()
    for (const s of signed || []) {
      if (s.path && s.signedUrl) signedByPath.set(s.path, s.signedUrl)
    }

    setItems(
      data.map((row) => ({
        ...row,
        signedUrl: signedByPath.get(row.storage_path) || '',
      }))
    )
    setLoading(false)
  }, [templateId, supabase])

  useEffect(() => {
    loadItems()
  }, [loadItems])

  async function handleFiles(files: FileList | File[]) {
    setError(null)
    setUploading(true)

    const { data: { user } } = await supabase.auth.getUser()
    if (!user) {
      setError('Non connecté')
      setUploading(false)
      return
    }

    const fileArr = Array.from(files)
    let nextPosition = items.length
    let anyUploaded = false

    for (const file of fileArr) {
      if (!ACCEPTED_TYPES.includes(file.type)) {
        setError(`Type non supporté: ${file.name} (${file.type})`)
        continue
      }
      if (file.size > MAX_SIZE_MB * 1024 * 1024) {
        setError(`Fichier trop gros: ${file.name} (>${MAX_SIZE_MB}MB)`)
        continue
      }

      const ext = file.name.split('.').pop()?.toLowerCase() || 'jpg'
      const filename = `${Date.now()}_${Math.random().toString(36).slice(2, 8)}.${ext}`
      const storagePath = `${user.id}/${templateId}/${filename}`

      const { error: uploadErr } = await supabase.storage
        .from('template-references')
        .upload(storagePath, file, { contentType: file.type, upsert: false })

      if (uploadErr) {
        setError(`Upload: ${uploadErr.message}`)
        continue
      }

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: insertErr } = await (supabase.from('template_references') as any).insert({
        template_id: templateId,
        user_id: user.id,
        storage_path: storagePath,
        position: nextPosition++,
      })

      if (insertErr) {
        await supabase.storage.from('template-references').remove([storagePath])
        setError(`DB: ${insertErr.message}`)
        continue
      }

      anyUploaded = true
    }

    setUploading(false)
    if (anyUploaded) await loadItems()
  }

  async function handleDelete(item: ReferenceItem) {
    if (!confirm('Supprimer cette image ?')) return
    await supabase.storage.from('template-references').remove([item.storage_path])
    await supabase.from('template_references').delete().eq('id', item.id)
    await loadItems()
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

  // Reorder via drag
  function onItemDragStart(id: string) {
    dragItemId.current = id
  }
  async function onItemDrop(targetId: string) {
    const sourceId = dragItemId.current
    dragItemId.current = null
    if (!sourceId || sourceId === targetId) return

    const sourceIdx = items.findIndex((i) => i.id === sourceId)
    const targetIdx = items.findIndex((i) => i.id === targetId)
    if (sourceIdx < 0 || targetIdx < 0) return

    const reordered = [...items]
    const [moved] = reordered.splice(sourceIdx, 1)
    reordered.splice(targetIdx, 0, moved)

    setItems(reordered)

    for (let i = 0; i < reordered.length; i++) {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      await (supabase.from('template_references') as any)
        .update({ position: i })
        .eq('id', reordered[i].id)
    }
  }

  return (
    <div>
      <h2 className="font-display text-xl font-semibold mb-1">Références visuelles</h2>
      <p className="text-sm text-ink-600 mb-4">
        Images d&apos;exemple envoyées à Gemini avant chaque génération. Le modèle s&apos;en
        inspire pour reproduire le style (palette, composition, ambiance). Glisse-déposer pour
        ajouter, drag sur la carte pour réordonner.
      </p>

      {/* Drop zone — uses a <label> so click-to-select works reliably */}
      <label
        htmlFor="ref-file-input"
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
          {uploading ? 'Upload en cours...' : 'Glisse tes images ici'}
        </p>
        <p className="text-xs text-ink-600/70">
          ou clique pour choisir — JPG, PNG, WebP — max {MAX_SIZE_MB}MB
        </p>
        <input
          id="ref-file-input"
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
          <button onClick={() => setError(null)} className="font-medium shrink-0">
            ✕
          </button>
        </div>
      )}

      {loading ? (
        <div className="text-center py-8 text-ink-600/60 text-sm">Chargement...</div>
      ) : items.length === 0 ? (
        <div className="text-center py-8 text-ink-600/60 text-sm">
          Aucune référence pour le moment.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3">
          {items.map((item, idx) => (
            <div
              key={item.id}
              draggable
              onDragStart={() => onItemDragStart(item.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={() => onItemDrop(item.id)}
              className="group relative aspect-square rounded-xl overflow-hidden bg-cream-100 shadow-soft hover:shadow-card transition cursor-move"
            >
              {item.signedUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={item.signedUrl}
                  alt={`Référence ${idx + 1}`}
                  className="w-full h-full object-cover"
                  draggable={false}
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-ink-600/40">
                  <ImageIcon size={24} />
                </div>
              )}
              <div className="absolute top-1.5 left-1.5 bg-white/90 rounded-full p-1">
                <GripVertical size={12} className="text-ink-700" />
              </div>
              <div className="absolute top-1.5 right-1.5 bg-white/90 rounded-full px-2 py-0.5 text-[10px] font-medium text-ink-900">
                {idx + 1}
              </div>
              <button
                onClick={() => handleDelete(item)}
                className="absolute bottom-1.5 right-1.5 p-1.5 bg-white/90 rounded-full opacity-0 group-hover:opacity-100 transition hover:bg-red-50 hover:text-red-600"
                title="Supprimer"
              >
                <Trash2 size={12} />
              </button>
            </div>
          ))}
        </div>
      )}

      {items.length > 0 && (
        <div className="mt-4 text-xs text-ink-600/60 flex items-center gap-2">
          <ImageIcon size={12} />
          {items.length} image{items.length > 1 ? 's' : ''} envoyée{items.length > 1 ? 's' : ''} à Gemini à chaque génération
        </div>
      )}
    </div>
  )
}
