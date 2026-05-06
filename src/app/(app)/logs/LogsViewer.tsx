'use client'

import { useMemo, useState } from 'react'
import { ChevronDown, ChevronRight, Copy } from 'lucide-react'

export type LogRow = {
  id: string
  run_id: string
  carousel_id: string | null
  step: string
  level: 'info' | 'warn' | 'error' | 'debug'
  message: string
  payload: Record<string, unknown> | null
  created_at: string
}

type Run = {
  runId: string
  startedAt: string
  endedAt: string
  entries: LogRow[]
}

function groupByRun(logs: LogRow[]): Run[] {
  const map = new Map<string, LogRow[]>()
  for (const log of logs) {
    if (!map.has(log.run_id)) map.set(log.run_id, [])
    map.get(log.run_id)!.push(log)
  }
  const runs: Run[] = []
  for (const [runId, entries] of map.entries()) {
    // entries arrive newest-first; reverse to chronological for display
    entries.sort((a, b) => a.created_at.localeCompare(b.created_at))
    runs.push({
      runId,
      startedAt: entries[0].created_at,
      endedAt: entries[entries.length - 1].created_at,
      entries,
    })
  }
  // newest run first
  runs.sort((a, b) => b.startedAt.localeCompare(a.startedAt))
  return runs
}

function formatTime(iso: string) {
  const d = new Date(iso)
  return d.toLocaleString('fr-FR', { dateStyle: 'short', timeStyle: 'medium' })
}

function levelColor(level: string) {
  switch (level) {
    case 'error': return 'bg-red-100 text-red-800 border-red-200'
    case 'warn': return 'bg-amber-100 text-amber-800 border-amber-200'
    case 'debug': return 'bg-slate-100 text-slate-700 border-slate-200'
    default: return 'bg-emerald-50 text-emerald-800 border-emerald-200'
  }
}

export function LogsViewer({ logs }: { logs: LogRow[] }) {
  const runs = useMemo(() => groupByRun(logs), [logs])
  const [openRuns, setOpenRuns] = useState<Set<string>>(() => new Set(runs[0] ? [runs[0].runId] : []))
  const [openEntries, setOpenEntries] = useState<Set<string>>(new Set())

  function toggleRun(id: string) {
    const next = new Set(openRuns)
    next.has(id) ? next.delete(id) : next.add(id)
    setOpenRuns(next)
  }
  function toggleEntry(id: string) {
    const next = new Set(openEntries)
    next.has(id) ? next.delete(id) : next.add(id)
    setOpenEntries(next)
  }

  if (runs.length === 0) {
    return (
      <div className="bg-white rounded-xl2 shadow-soft p-12 text-center text-ink-600">
        Aucun log pour l&apos;instant. Lance une génération depuis le Dashboard.
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {runs.map((run) => {
        const expanded = openRuns.has(run.runId)
        const errorCount = run.entries.filter((e) => e.level === 'error').length
        return (
          <div key={run.runId} className="bg-white rounded-xl2 shadow-soft overflow-hidden">
            <button
              onClick={() => toggleRun(run.runId)}
              className="w-full flex items-center gap-3 px-5 py-4 hover:bg-cream-50 transition text-left"
            >
              {expanded ? <ChevronDown size={16} /> : <ChevronRight size={16} />}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-mono text-xs text-ink-600">{run.runId.slice(0, 8)}</span>
                  <span className="text-sm font-medium text-ink-900">{formatTime(run.startedAt)}</span>
                  {errorCount > 0 && (
                    <span className="text-xs px-2 py-0.5 rounded bg-red-100 text-red-800 border border-red-200">
                      {errorCount} erreur{errorCount > 1 ? 's' : ''}
                    </span>
                  )}
                </div>
                <div className="text-xs text-ink-600 mt-0.5">
                  {run.entries.length} étape{run.entries.length > 1 ? 's' : ''}
                </div>
              </div>
            </button>

            {expanded && (
              <div className="border-t border-cream-100">
                {run.entries.map((entry) => {
                  const open = openEntries.has(entry.id)
                  return (
                    <div key={entry.id} className="border-b border-cream-100 last:border-b-0">
                      <button
                        onClick={() => toggleEntry(entry.id)}
                        className="w-full flex items-start gap-3 px-5 py-3 hover:bg-cream-50 transition text-left"
                      >
                        {open ? <ChevronDown size={14} className="mt-1" /> : <ChevronRight size={14} className="mt-1" />}
                        <span className={`shrink-0 text-[10px] px-1.5 py-0.5 rounded border ${levelColor(entry.level)}`}>
                          {entry.level}
                        </span>
                        <span className="font-mono text-xs text-ink-700 shrink-0">
                          {new Date(entry.created_at).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit', fractionalSecondDigits: 3 })}
                        </span>
                        <span className="font-mono text-xs px-1.5 py-0.5 rounded bg-ink-900 text-white shrink-0">
                          {entry.step}
                        </span>
                        <span className="text-sm text-ink-900 truncate">{entry.message}</span>
                      </button>

                      {open && entry.payload && (
                        <div className="px-5 pb-4 pl-12">
                          <PayloadView payload={entry.payload} />
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )
      })}
    </div>
  )
}

function PayloadView({ payload }: { payload: Record<string, unknown> }) {
  return (
    <div className="space-y-2">
      {Object.entries(payload).map(([key, value]) => (
        <PayloadField key={key} label={key} value={value} />
      ))}
    </div>
  )
}

function PayloadField({ label, value }: { label: string; value: unknown }) {
  const stringified = typeof value === 'string' ? value : JSON.stringify(value, null, 2)
  const isLong = stringified.length > 200
  const [expanded, setExpanded] = useState(!isLong)

  function copy() {
    navigator.clipboard.writeText(stringified)
  }

  return (
    <div className="text-xs">
      <div className="flex items-center gap-2 mb-1">
        <span className="font-mono font-medium text-ink-700">{label}</span>
        <button onClick={copy} className="text-ink-600 hover:text-ink-900 p-0.5 rounded hover:bg-cream-100" title="Copier">
          <Copy size={12} />
        </button>
        {isLong && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="text-ink-600 hover:text-ink-900 text-[10px] px-1.5 py-0.5 rounded bg-cream-100 hover:bg-cream-200"
          >
            {expanded ? 'Réduire' : `Voir tout (${stringified.length} car.)`}
          </button>
        )}
      </div>
      <pre className={`bg-cream-50 border border-cream-200 rounded p-2.5 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] leading-relaxed ${expanded ? '' : 'max-h-24 overflow-y-hidden relative'}`}>
        {stringified}
      </pre>
    </div>
  )
}
