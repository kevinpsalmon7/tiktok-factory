'use client'

import { useMemo } from 'react'

/**
 * Circular budget gauge for the combined word count of every instruction
 * section feeding the LLM.
 *
 * Why these thresholds (max = 10 000 words):
 *   0     – 2 500 words → green  : excellent rule adherence
 *   2 500 – 5 000 words → yellow : good, minor drift on secondary rules
 *   5 000 – 8 000 words → orange : moderate risk of dropped details
 *   8 000+ words        → red    : important rules start to be ignored
 *
 * Counting all dense instruction text (rules + examples + style + avatar +
 * randomization) the model must follow strictly.
 */
const MAX_WORDS = 10000

type Level = { color: string; ringBg: string; label: string }

function levelForWords(words: number): Level {
  if (words < 2500) return { color: '#10b981', ringBg: '#d1fae5', label: 'Excellent' }
  if (words < 5000) return { color: '#eab308', ringBg: '#fef3c7', label: 'Bon' }
  if (words < 8000) return { color: '#f97316', ringBg: '#ffedd5', label: 'Attention' }
  return { color: '#ef4444', ringBg: '#fee2e2', label: 'Trop dense' }
}

function countWords(text: string): number {
  if (!text) return 0
  return text.trim().split(/\s+/).filter(Boolean).length
}

export function InstructionBudgetGauge({ texts }: { texts: string[] }) {
  const total = useMemo(
    () => texts.reduce((sum, t) => sum + countWords(t || ''), 0),
    [texts]
  )

  const pct = Math.min(100, (total / MAX_WORDS) * 100)
  const level = levelForWords(total)

  // SVG circle geometry
  const SIZE = 72
  const STROKE = 6
  const R = (SIZE - STROKE) / 2
  const C = 2 * Math.PI * R
  const dashOffset = C * (1 - pct / 100)

  return (
    <div
      className="flex flex-col items-center shrink-0"
      title={`${total.toLocaleString('fr-FR')} mots cumulés sur les 6 sections — ${level.label.toLowerCase()}.

Seuils :
0 – 2 500 : Excellent
2 500 – 5 000 : Bon
5 000 – 8 000 : Attention
8 000+ : Trop dense (l'IA risque d'ignorer des règles)`}
    >
      <div className="relative" style={{ width: SIZE, height: SIZE }}>
        <svg width={SIZE} height={SIZE} viewBox={`0 0 ${SIZE} ${SIZE}`}>
          {/* Background ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={level.ringBg}
            strokeWidth={STROKE}
          />
          {/* Progress ring */}
          <circle
            cx={SIZE / 2}
            cy={SIZE / 2}
            r={R}
            fill="none"
            stroke={level.color}
            strokeWidth={STROKE}
            strokeLinecap="round"
            strokeDasharray={C}
            strokeDashoffset={dashOffset}
            transform={`rotate(-90 ${SIZE / 2} ${SIZE / 2})`}
            style={{ transition: 'stroke-dashoffset 300ms ease, stroke 300ms ease' }}
          />
        </svg>
        <div
          className="absolute inset-0 flex items-center justify-center text-xs font-semibold"
          style={{ color: level.color }}
        >
          {Math.round(pct)}%
        </div>
      </div>
      <div className="mt-1 text-[11px] text-ink-600 tabular-nums">
        {total.toLocaleString('fr-FR')} / {MAX_WORDS.toLocaleString('fr-FR')}
      </div>
    </div>
  )
}
