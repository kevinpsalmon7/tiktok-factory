'use client'

import { useState, useRef, useEffect } from 'react'
import { Pencil, Check, X } from 'lucide-react'

function InlineEdit({
  value,
  onSave,
  className,
  placeholder,
  multiline = false,
}: {
  value: string
  onSave: (v: string) => Promise<void>
  className?: string
  placeholder?: string
  multiline?: boolean
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const ref = useRef<HTMLTextAreaElement & HTMLInputElement>(null)

  useEffect(() => {
    if (editing) ref.current?.focus()
  }, [editing])

  async function save() {
    setSaving(true)
    await onSave(draft)
    setSaving(false)
    setEditing(false)
  }

  function cancel() {
    setDraft(value)
    setEditing(false)
  }

  if (!editing) {
    return (
      <button
        onClick={() => setEditing(true)}
        className={`group text-left flex items-start gap-1.5 hover:opacity-80 ${className}`}
      >
        <span>{value || <span className="text-ink-600/40">{placeholder}</span>}</span>
        <Pencil size={13} className="shrink-0 mt-0.5 opacity-0 group-hover:opacity-40 transition" />
      </button>
    )
  }

  return (
    <div className="flex items-start gap-2">
      {multiline ? (
        <textarea
          ref={ref as React.RefObject<HTMLTextAreaElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          rows={3}
          className={`textarea text-sm flex-1 ${className}`}
        />
      ) : (
        <input
          ref={ref as React.RefObject<HTMLInputElement>}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => { if (e.key === 'Enter') save(); if (e.key === 'Escape') cancel() }}
          className={`input flex-1 ${className}`}
        />
      )}
      <button onClick={save} disabled={saving} className="p-1.5 rounded-lg bg-ink-900 text-white hover:bg-ink-800 disabled:opacity-50">
        <Check size={13} />
      </button>
      <button onClick={cancel} className="p-1.5 rounded-lg bg-cream-100 hover:bg-cream-200">
        <X size={13} />
      </button>
    </div>
  )
}

export function CarouselMeta({
  id,
  initialTitle,
  initialDescription,
  fallbackTitle,
}: {
  id: string
  initialTitle: string
  initialDescription: string
  fallbackTitle: string
}) {
  const [title, setTitle] = useState(initialTitle || fallbackTitle)
  const [description, setDescription] = useState(initialDescription)

  async function saveTitle(v: string) {
    setTitle(v || fallbackTitle)
    await fetch(`/api/carousels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ title: v }),
    })
  }

  async function saveDescription(v: string) {
    setDescription(v)
    await fetch(`/api/carousels/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ description: v }),
    })
  }

  return (
    <div className="space-y-1">
      <InlineEdit
        value={title}
        onSave={saveTitle}
        placeholder="Sans titre"
        className="font-display text-3xl font-semibold text-ink-900"
      />
      <InlineEdit
        value={description}
        onSave={saveDescription}
        placeholder="Ajouter une description…"
        className="text-sm text-ink-600"
        multiline
      />
    </div>
  )
}
