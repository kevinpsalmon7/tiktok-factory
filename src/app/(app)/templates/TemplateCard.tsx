'use client'

import Link from 'next/link'
import { useRef, useState, useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { LayoutTemplate, ImagePlus, Loader2 } from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { DuplicateTemplateButton } from './DuplicateTemplateButton'

type Props = {
  id: string
  name: string
  thumbnailUrl: string | null
  userId: string
}

export function TemplateCard({ id, name, thumbnailUrl, userId }: Props) {
  const router = useRouter()
  const fileRef = useRef<HTMLInputElement>(null)
  const [uploading, setUploading] = useState(false)
  const [, startTransition] = useTransition()
  const [previewUrl, setPreviewUrl] = useState<string | null>(thumbnailUrl)

  async function handleUpload(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploading(true)
    try {
      const supabase = createClient()
      const ext = file.name.split('.').pop()?.toLowerCase() ?? 'jpg'
      const path = `${userId}/${id}-${Date.now()}.${ext}`

      const { error: uploadErr } = await supabase.storage
        .from('template-thumbnails')
        .upload(path, file, { cacheControl: '3600', upsert: false })
      if (uploadErr) throw uploadErr

      const { data: pub } = supabase.storage.from('template-thumbnails').getPublicUrl(path)
      const url = pub.publicUrl

      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error: updateErr } = await (supabase.from('templates') as any)
        .update({ thumbnail_url: url })
        .eq('id', id)
      if (updateErr) throw updateErr

      setPreviewUrl(url)
      startTransition(() => router.refresh())
    } catch (err) {
      console.error(err)
      alert('Upload échoué')
    } finally {
      setUploading(false)
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  return (
    <div className="pastel-card bg-white hover:bg-cream-50 flex flex-col gap-3 group relative">
      <DuplicateTemplateButton templateId={id} templateName={name} />

      {/* Image area — clickable to upload, separate from the navigation link */}
      <button
        type="button"
        onClick={() => fileRef.current?.click()}
        disabled={uploading}
        className="aspect-[9/16] rounded-xl bg-cream-100 overflow-hidden relative cursor-pointer hover:opacity-90 transition disabled:opacity-50"
        title={previewUrl ? 'Replace image' : 'Upload image'}
      >
        {previewUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={previewUrl}
            alt={name}
            className="w-full h-full object-cover"
          />
        ) : (
          <div className="absolute inset-0 flex items-center justify-center">
            <LayoutTemplate size={48} className="text-ink-600/30" />
          </div>
        )}
        <div className="absolute inset-0 bg-ink-900/0 group-hover:bg-ink-900/30 transition-colors flex items-center justify-center">
          {uploading ? (
            <Loader2 size={28} className="text-white animate-spin" />
          ) : (
            <ImagePlus
              size={28}
              className="text-white opacity-0 group-hover:opacity-100 transition-opacity"
            />
          )}
        </div>
      </button>
      <input
        ref={fileRef}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={handleUpload}
      />

      {/* Title — clickable, navigates to editor */}
      <Link href={`/templates/${id}`}>
        <h3 className="font-display text-xl font-semibold text-ink-900 text-center">
          {name}
        </h3>
      </Link>
    </div>
  )
}
