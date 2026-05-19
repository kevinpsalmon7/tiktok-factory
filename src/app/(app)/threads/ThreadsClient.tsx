'use client'

import { useState, useCallback } from 'react'
import { useRouter } from 'next/navigation'
import {
  Plus, Trash2, Link2, Settings, Image as ImageIcon,
  Sparkles, Send, Clock, CheckCircle2, XCircle, Loader2,
  ExternalLink, RefreshCw, CalendarClock,
} from 'lucide-react'
import Image from 'next/image'
import { createClient } from '@/lib/supabase/client'

type Account = {
  id: string
  username: string
  instructions: string
  token_expires_at: string | null
  created_at: string
}

type ThreadsImage = {
  id: string
  url: string
  name: string
  created_at: string
}

type GeneratedPost = {
  content: string
  image_url: string | null
  scheduled_at?: string
}

type QueuedPost = {
  id: string
  content: string
  image_url: string | null
  scheduled_at: string | null
  status: 'pending' | 'sent' | 'failed' | 'cancelled'
  sent_at: string | null
  error: string | null
  account_id: string
}

type Tab = 'accounts' | 'generate' | 'queue' | 'images'

export function ThreadsClient({
  initialAccounts,
  initialImages,
}: {
  initialAccounts: Account[]
  initialImages: ThreadsImage[]
}) {
  const router = useRouter()
  const [tab, setTab] = useState<Tab>('accounts')
  const [accounts, setAccounts] = useState(initialAccounts)
  const [images, setImages] = useState(initialImages)
  const [selectedAccountId, setSelectedAccountId] = useState(initialAccounts[0]?.id || '')
  const [instructions, setInstructions] = useState<Record<string, string>>(
    Object.fromEntries(initialAccounts.map(a => [a.id, a.instructions || '']))
  )
  const [savingInstructions, setSavingInstructions] = useState<string | null>(null)
  const [generateCount, setGenerateCount] = useState(10)
  const [generating, setGenerating] = useState(false)
  const [generatedPosts, setGeneratedPosts] = useState<GeneratedPost[]>([])
  const [savingQueue, setSavingQueue] = useState(false)
  const [queuedPosts, setQueuedPosts] = useState<QueuedPost[]>([])
  const [loadingQueue, setLoadingQueue] = useState(false)
  const [publishingId, setPublishingId] = useState<string | null>(null)
  const [uploadingImage, setUploadingImage] = useState(false)

  // ── OAuth connect ──────────────────────────────────────────────────────────
  function handleConnect() {
    window.location.href = '/api/threads/auth'
  }

  // ── Disconnect account ──────────────────────────────────────────────────────
  async function handleDisconnect(accountId: string) {
    if (!confirm('Disconnect this Threads account?')) return
    await fetch('/api/threads/disconnect', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId }),
    })
    setAccounts(a => a.filter(acc => acc.id !== accountId))
    if (selectedAccountId === accountId) {
      setSelectedAccountId(accounts.find(a => a.id !== accountId)?.id || '')
    }
  }

  // ── Save instructions ───────────────────────────────────────────────────────
  async function handleSaveInstructions(accountId: string) {
    setSavingInstructions(accountId)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('threads_accounts') as any)
      .update({ instructions: instructions[accountId] })
      .eq('id', accountId)
    setSavingInstructions(null)
  }

  // ── Generate posts ──────────────────────────────────────────────────────────
  async function handleGenerate() {
    if (!selectedAccountId) return
    setGenerating(true)
    setGeneratedPosts([])
    const res = await fetch('/api/threads/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accountId: selectedAccountId, count: generateCount }),
    })
    const data = await res.json()
    if (data.posts) {
      // Default schedule: spread over next 24h, one every ~(24h/count) minutes
      const now = Date.now()
      const interval = (24 * 60 * 60 * 1000) / generateCount
      setGeneratedPosts(data.posts.map((p: GeneratedPost, i: number) => ({
        ...p,
        scheduled_at: new Date(now + i * interval).toISOString(),
      })))
    }
    setGenerating(false)
  }

  // ── Save to queue ───────────────────────────────────────────────────────────
  async function handleSaveToQueue() {
    if (!selectedAccountId || !generatedPosts.length) return
    setSavingQueue(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const rows = generatedPosts.map(p => ({
      user_id: user.id,
      account_id: selectedAccountId,
      content: p.content,
      image_url: p.image_url || null,
      scheduled_at: p.scheduled_at || null,
      status: 'pending',
    }))

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('threads_posts') as any).insert(rows)
    setSavingQueue(false)
    setGeneratedPosts([])
    setTab('queue')
    loadQueue()
  }

  // ── Load queue ──────────────────────────────────────────────────────────────
  const loadQueue = useCallback(async () => {
    if (!selectedAccountId) return
    setLoadingQueue(true)
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data } = await (supabase.from('threads_posts') as any)
      .select('*')
      .eq('account_id', selectedAccountId)
      .order('scheduled_at', { ascending: true })
      .limit(100)
    setQueuedPosts(data || [])
    setLoadingQueue(false)
  }, [selectedAccountId])

  // ── Publish now ─────────────────────────────────────────────────────────────
  async function handlePublishNow(postId: string) {
    setPublishingId(postId)
    const res = await fetch('/api/threads/publish', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ postId }),
    })
    const data = await res.json()
    if (data.ok) {
      setQueuedPosts(q => q.map(p => p.id === postId
        ? { ...p, status: 'sent', sent_at: new Date().toISOString() }
        : p
      ))
    } else {
      setQueuedPosts(q => q.map(p => p.id === postId
        ? { ...p, status: 'failed', error: data.error }
        : p
      ))
    }
    setPublishingId(null)
  }

  // ── Delete queued post ──────────────────────────────────────────────────────
  async function handleDeletePost(postId: string) {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('threads_posts') as any).delete().eq('id', postId)
    setQueuedPosts(q => q.filter(p => p.id !== postId))
  }

  // ── Upload image ────────────────────────────────────────────────────────────
  async function handleUploadImage(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return
    setUploadingImage(true)
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const ext = file.name.split('.').pop()
    const path = `threads/${user.id}/${Date.now()}.${ext}`
    const { error: uploadErr } = await supabase.storage.from('carousels').upload(path, file, { upsert: true })
    if (uploadErr) { setUploadingImage(false); return }

    const { data: { publicUrl } } = supabase.storage.from('carousels').getPublicUrl(path)

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const { data: row } = await (supabase.from('threads_images') as any)
      .insert({ user_id: user.id, url: publicUrl, name: file.name })
      .select('id, url, name, created_at')
      .single()
    if (row) setImages(imgs => [row, ...imgs])
    setUploadingImage(false)
    e.target.value = ''
  }

  async function handleDeleteImage(imageId: string) {
    const supabase = createClient()
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    await (supabase.from('threads_images') as any).delete().eq('id', imageId)
    setImages(imgs => imgs.filter(i => i.id !== imageId))
  }

  const selectedAccount = accounts.find(a => a.id === selectedAccountId)

  return (
    <div className="flex flex-col h-full">
      {/* Header */}
      <div className="flex items-center gap-4 px-6 py-4 border-b border-cream-100">
        <h1 className="font-display text-2xl font-bold text-ink-900 flex-1">Threads</h1>
        {accounts.length < 2 && (
          <button
            onClick={handleConnect}
            className="inline-flex items-center gap-2 px-4 py-2 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 transition shadow-card"
          >
            <Link2 size={14} />
            Connect account
          </button>
        )}
      </div>

      {/* Tabs */}
      <div className="flex gap-1 px-6 pt-4">
        {([
          { id: 'accounts', label: 'Accounts', icon: Settings },
          { id: 'generate', label: 'Generate', icon: Sparkles },
          { id: 'queue', label: 'Queue', icon: CalendarClock },
          { id: 'images', label: 'Images', icon: ImageIcon },
        ] as const).map(({ id, label, icon: Icon }) => (
          <button
            key={id}
            onClick={() => { setTab(id); if (id === 'queue') loadQueue() }}
            className={`flex items-center gap-1.5 px-4 py-2 rounded-full text-sm font-medium transition ${
              tab === id
                ? 'bg-ink-900 text-white shadow-card'
                : 'bg-white text-ink-600 hover:bg-cream-50 shadow-soft'
            }`}
          >
            <Icon size={14} />
            {label}
          </button>
        ))}
      </div>

      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">

        {/* ── ACCOUNTS TAB ── */}
        {tab === 'accounts' && (
          <div className="space-y-4">
            {accounts.length === 0 && (
              <div className="bg-white rounded-xl2 shadow-soft p-10 text-center">
                <p className="text-ink-500 mb-4">No Threads account connected yet.</p>
                <button
                  onClick={handleConnect}
                  className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 transition shadow-card"
                >
                  <Link2 size={14} /> Connect a Threads account
                </button>
              </div>
            )}
            {accounts.map(account => (
              <div key={account.id} className="bg-white rounded-xl2 shadow-soft p-6 space-y-4">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-full bg-pastel-lavender flex items-center justify-center font-semibold text-ink-900">
                      {account.username[0]?.toUpperCase()}
                    </div>
                    <div>
                      <p className="font-semibold text-ink-900">@{account.username}</p>
                      <p className="text-xs text-ink-400">
                        Token expires {account.token_expires_at
                          ? new Date(account.token_expires_at).toLocaleDateString('en-US')
                          : 'unknown'}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <a
                      href={`https://www.threads.net/@${account.username}`}
                      target="_blank" rel="noopener noreferrer"
                      className="p-2 rounded-lg hover:bg-cream-50 text-ink-400 hover:text-ink-900 transition"
                    >
                      <ExternalLink size={15} />
                    </a>
                    <button
                      onClick={() => handleDisconnect(account.id)}
                      className="p-2 rounded-lg hover:bg-red-50 text-ink-400 hover:text-red-500 transition"
                    >
                      <Trash2 size={15} />
                    </button>
                  </div>
                </div>

                <div>
                  <label className="text-xs text-ink-500 mb-1.5 block font-medium">
                    Generation instructions for this account
                  </label>
                  <textarea
                    className="textarea min-h-[140px] text-sm"
                    placeholder="Describe the tone, topics, style, what to avoid... Claude will follow these instructions when generating posts for this account."
                    value={instructions[account.id] || ''}
                    onChange={e => setInstructions(i => ({ ...i, [account.id]: e.target.value }))}
                  />
                  <div className="flex justify-end mt-2">
                    <button
                      onClick={() => handleSaveInstructions(account.id)}
                      disabled={savingInstructions === account.id}
                      className="inline-flex items-center gap-1.5 px-4 py-2 bg-ink-900 text-white rounded-full text-xs font-medium hover:bg-ink-800 disabled:opacity-50 transition"
                    >
                      {savingInstructions === account.id ? <Loader2 size={12} className="animate-spin" /> : null}
                      Save instructions
                    </button>
                  </div>
                </div>
              </div>
            ))}
            {accounts.length === 1 && (
              <button
                onClick={handleConnect}
                className="w-full py-4 border-2 border-dashed border-cream-200 rounded-xl2 text-sm text-ink-400 hover:text-ink-600 hover:border-cream-300 transition flex items-center justify-center gap-2"
              >
                <Plus size={16} /> Connect a second account
              </button>
            )}
          </div>
        )}

        {/* ── GENERATE TAB ── */}
        {tab === 'generate' && (
          <div className="space-y-4">
            {accounts.length === 0 ? (
              <div className="bg-white rounded-xl2 shadow-soft p-8 text-center text-ink-500">
                Connect an account first.
              </div>
            ) : (
              <>
                <div className="bg-white rounded-xl2 shadow-soft p-5 flex items-center gap-4">
                  <div className="flex-1">
                    <label className="text-xs text-ink-500 mb-1 block">Account</label>
                    <select
                      className="input"
                      value={selectedAccountId}
                      onChange={e => setSelectedAccountId(e.target.value)}
                    >
                      {accounts.map(a => (
                        <option key={a.id} value={a.id}>@{a.username}</option>
                      ))}
                    </select>
                  </div>
                  <div className="w-28">
                    <label className="text-xs text-ink-500 mb-1 block">Posts to generate</label>
                    <input
                      type="number"
                      min={1} max={50}
                      className="input text-center"
                      value={generateCount}
                      onChange={e => setGenerateCount(Number(e.target.value))}
                    />
                  </div>
                  <div className="pt-5">
                    <button
                      onClick={handleGenerate}
                      disabled={generating || !selectedAccountId}
                      className="inline-flex items-center gap-2 px-5 py-2.5 bg-ink-900 text-white rounded-full text-sm font-medium hover:bg-ink-800 disabled:opacity-50 transition shadow-card"
                    >
                      {generating
                        ? <><Loader2 size={14} className="animate-spin" /> Generating…</>
                        : <><Sparkles size={14} /> Generate</>}
                    </button>
                  </div>
                </div>

                {selectedAccount?.instructions && (
                  <div className="bg-pastel-mint/40 rounded-xl px-4 py-3 text-xs text-ink-600">
                    <span className="font-semibold">Instructions active for @{selectedAccount.username}</span>
                  </div>
                )}

                {generatedPosts.length > 0 && (
                  <div className="space-y-3">
                    <div className="flex items-center justify-between">
                      <p className="text-sm font-medium text-ink-700">{generatedPosts.length} posts generated</p>
                      <button
                        onClick={handleSaveToQueue}
                        disabled={savingQueue}
                        className="inline-flex items-center gap-2 px-4 py-2 bg-pastel-mint text-ink-900 rounded-full text-sm font-medium hover:bg-pastel-mint/80 disabled:opacity-50 transition shadow-soft"
                      >
                        {savingQueue ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                        Add all to queue
                      </button>
                    </div>
                    {generatedPosts.map((post, i) => (
                      <GeneratedPostCard
                        key={i}
                        post={post}
                        index={i}
                        total={generatedPosts.length}
                        onChange={updated => setGeneratedPosts(posts =>
                          posts.map((p, j) => j === i ? updated : p)
                        )}
                        onRemove={() => setGeneratedPosts(posts => posts.filter((_, j) => j !== i))}
                      />
                    ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* ── QUEUE TAB ── */}
        {tab === 'queue' && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                {accounts.map(a => (
                  <button
                    key={a.id}
                    onClick={() => { setSelectedAccountId(a.id); loadQueue() }}
                    className={`px-4 py-1.5 rounded-full text-sm font-medium transition ${
                      selectedAccountId === a.id
                        ? 'bg-ink-900 text-white'
                        : 'bg-white text-ink-600 shadow-soft hover:bg-cream-50'
                    }`}
                  >
                    @{a.username}
                  </button>
                ))}
              </div>
              <button onClick={loadQueue} className="p-2 rounded-lg hover:bg-cream-50 text-ink-400 hover:text-ink-700 transition">
                <RefreshCw size={15} />
              </button>
            </div>

            {loadingQueue ? (
              <div className="flex justify-center py-10"><Loader2 size={20} className="animate-spin text-ink-400" /></div>
            ) : queuedPosts.length === 0 ? (
              <div className="bg-white rounded-xl2 shadow-soft p-8 text-center text-ink-400 text-sm">
                No posts in queue for this account.
              </div>
            ) : (
              queuedPosts.map(post => (
                <QueuedPostCard
                  key={post.id}
                  post={post}
                  publishing={publishingId === post.id}
                  onPublish={() => handlePublishNow(post.id)}
                  onDelete={() => handleDeletePost(post.id)}
                />
              ))
            )}
          </div>
        )}

        {/* ── IMAGES TAB ── */}
        {tab === 'images' && (
          <div className="space-y-4">
            <div className="bg-white rounded-xl2 shadow-soft p-5">
              <label className="flex flex-col items-center gap-3 cursor-pointer py-6 border-2 border-dashed border-cream-200 rounded-xl hover:border-cream-300 transition">
                {uploadingImage
                  ? <Loader2 size={24} className="animate-spin text-ink-400" />
                  : <ImageIcon size={24} className="text-ink-400" />}
                <span className="text-sm text-ink-500">
                  {uploadingImage ? 'Uploading…' : 'Click to upload an image'}
                </span>
                <input type="file" accept="image/*" className="hidden" onChange={handleUploadImage} />
              </label>
            </div>

            {images.length === 0 ? (
              <p className="text-center text-sm text-ink-400 py-4">No images yet.</p>
            ) : (
              <div className="grid grid-cols-3 gap-3">
                {images.map(img => (
                  <div key={img.id} className="group relative bg-white rounded-xl shadow-soft overflow-hidden aspect-square">
                    <Image src={img.url} alt={img.name} fill className="object-cover" />
                    <div className="absolute inset-0 bg-black/0 group-hover:bg-black/30 transition flex items-center justify-center opacity-0 group-hover:opacity-100">
                      <button
                        onClick={() => handleDeleteImage(img.id)}
                        className="p-2 bg-white rounded-full shadow-card text-red-500 hover:bg-red-50 transition"
                      >
                        <Trash2 size={14} />
                      </button>
                    </div>
                    <p className="absolute bottom-0 inset-x-0 bg-black/50 text-white text-[10px] px-2 py-1 truncate">
                      {img.name}
                    </p>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── Sub-components ─────────────────────────────────────────────────────────────

function GeneratedPostCard({
  post, index, total, onChange, onRemove,
}: {
  post: GeneratedPost
  index: number
  total: number
  onChange: (p: GeneratedPost) => void
  onRemove: () => void
}) {
  return (
    <div className="bg-white rounded-xl2 shadow-soft p-4 space-y-3">
      <div className="flex items-center justify-between">
        <span className="text-xs text-ink-400 font-medium">Post {index + 1}/{total}</span>
        <div className="flex items-center gap-2">
          {post.scheduled_at && (
            <span className="flex items-center gap-1 text-xs text-ink-400">
              <Clock size={11} />
              {new Date(post.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
            </span>
          )}
          <button onClick={onRemove} className="p-1 hover:text-red-500 text-ink-300 transition">
            <XCircle size={15} />
          </button>
        </div>
      </div>
      <textarea
        className="textarea min-h-[80px] text-sm"
        value={post.content}
        onChange={e => onChange({ ...post, content: e.target.value })}
      />
      <div className="flex items-center gap-2">
        <input
          className="input text-xs flex-1"
          placeholder="Image URL (optional)"
          value={post.image_url || ''}
          onChange={e => onChange({ ...post, image_url: e.target.value || null })}
        />
        <input
          type="datetime-local"
          className="input text-xs w-44"
          value={post.scheduled_at ? post.scheduled_at.slice(0, 16) : ''}
          onChange={e => onChange({ ...post, scheduled_at: e.target.value ? new Date(e.target.value).toISOString() : undefined })}
        />
      </div>
      <p className="text-right text-xs text-ink-400">{post.content.length}/500</p>
    </div>
  )
}

function QueuedPostCard({
  post, publishing, onPublish, onDelete,
}: {
  post: QueuedPost
  publishing: boolean
  onPublish: () => void
  onDelete: () => void
}) {
  const statusIcon = {
    pending: <Clock size={13} className="text-ink-400" />,
    sent: <CheckCircle2 size={13} className="text-green-500" />,
    failed: <XCircle size={13} className="text-red-400" />,
    cancelled: <XCircle size={13} className="text-ink-300" />,
  }[post.status]

  return (
    <div className={`bg-white rounded-xl2 shadow-soft p-4 space-y-2 ${post.status === 'sent' ? 'opacity-60' : ''}`}>
      <div className="flex items-start justify-between gap-3">
        <p className="text-sm text-ink-800 flex-1 leading-relaxed">{post.content}</p>
        <div className="flex items-center gap-1.5 shrink-0 pt-0.5">
          {statusIcon}
          {post.status === 'pending' && (
            <button
              onClick={onPublish}
              disabled={publishing}
              className="inline-flex items-center gap-1 px-3 py-1.5 bg-ink-900 text-white rounded-full text-xs font-medium hover:bg-ink-800 disabled:opacity-50 transition"
            >
              {publishing ? <Loader2 size={11} className="animate-spin" /> : <Send size={11} />}
              Post now
            </button>
          )}
          {post.status !== 'sent' && (
            <button onClick={onDelete} className="p-1.5 hover:text-red-500 text-ink-300 transition">
              <Trash2 size={13} />
            </button>
          )}
        </div>
      </div>
      {post.image_url && (
        <div className="relative h-32 rounded-lg overflow-hidden bg-cream-50">
          <Image src={post.image_url} alt="post image" fill className="object-cover" />
        </div>
      )}
      <div className="flex items-center gap-3 text-xs text-ink-400">
        {post.scheduled_at && (
          <span className="flex items-center gap-1">
            <CalendarClock size={11} />
            {new Date(post.scheduled_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
          </span>
        )}
        {post.sent_at && (
          <span className="text-green-600">Sent {new Date(post.sent_at).toLocaleString('en-US', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</span>
        )}
        {post.error && <span className="text-red-400 truncate max-w-xs">{post.error}</span>}
      </div>
    </div>
  )
}
