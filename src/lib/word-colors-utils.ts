/**
 * Utilities for {{word}} per-word color markers.
 *
 * The LLM wraps exact occurrences of user-specified words inside `{{...}}`.
 * The renderer parses these markers and colors each wrapped occurrence with
 * the user-defined color (from template.layout.wordColors).
 *
 * Syntax was chosen to:
 *   1. Not conflict with the existing ==word== highlight syntax.
 *   2. Be unlikely to appear naturally in user content (no `{{` in French/English prose).
 *   3. Be trivially strippable when no color is set.
 */

export type WordColor = { word: string; color: string }

export type ColorSegment = {
  text: string
  /** Hex color, or null if the segment uses the paragraph's default color. */
  color: string | null
}

const COLOR_RE = /\{\{(.+?)\}\}/gs

/**
 * Parse `{{word}}` markers into a flat list of segments.
 * If a wrapped word matches an entry in `colorMap` (case-insensitive), the
 * segment gets that color. Otherwise the marker is stripped and the text
 * keeps the default color (fail-safe — no broken output even if the LLM
 * wraps something unmapped).
 */
export function parseColorSegments(
  text: string,
  wordColors: WordColor[] | undefined
): ColorSegment[] {
  const segments: ColorSegment[] = []

  const colorMap = new Map<string, string>()
  for (const wc of wordColors ?? []) {
    if (wc.word && wc.color) colorMap.set(wc.word.toLowerCase(), wc.color)
  }

  let lastIndex = 0
  let match
  const re = new RegExp(COLOR_RE.source, 'gs')
  while ((match = re.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), color: null })
    }
    const word = match[1]
    const color = colorMap.get(word.toLowerCase()) ?? null
    segments.push({ text: word, color })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), color: null })
  }
  return segments.length > 0 ? segments : [{ text, color: null }]
}

/** Strip all `{{...}}` markers, returning plain display text. */
export function stripColorMarkers(text: string): string {
  return text.replace(COLOR_RE, '$1')
}

/** True if the text contains any `{{...}}` markers. */
export function hasColorMarkers(text: string): boolean {
  return /\{\{.+?\}\}/s.test(text)
}
