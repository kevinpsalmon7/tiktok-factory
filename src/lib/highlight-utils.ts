/**
 * Utilities for ==word== highlight syntax.
 *
 * The AI wraps key words/phrases in ==...== markers inside text_fields values.
 * These markers are parsed client-side to draw rough hand-drawn highlight
 * rectangles behind the text using roughjs.
 */

export type TextSegment = { text: string; highlighted: boolean }

/** Parse ==...== markers into a flat list of segments. */
export function parseHighlightSegments(text: string): TextSegment[] {
  const segments: TextSegment[] = []
  const regex = /==(.+?)==/gs
  let lastIndex = 0
  let match
  while ((match = regex.exec(text)) !== null) {
    if (match.index > lastIndex) {
      segments.push({ text: text.slice(lastIndex, match.index), highlighted: false })
    }
    segments.push({ text: match[1], highlighted: true })
    lastIndex = match.index + match[0].length
  }
  if (lastIndex < text.length) {
    segments.push({ text: text.slice(lastIndex), highlighted: false })
  }
  return segments.length > 0 ? segments : [{ text, highlighted: false }]
}

/** Strip ==...== markers, returning plain display text. */
export function stripHighlightMarkers(text: string): string {
  return text.replace(/==(.+?)==/gs, '$1')
}

/** True if the text contains any ==...== markers. */
export function hasHighlightMarkers(text: string): boolean {
  return /==.+?==/s.test(text)
}

export type HighlightRect = { x: number; y: number; w: number; h: number }

/**
 * Given wrapped lines (markers already stripped) and the original text
 * (with ==...== markers), compute bounding rectangles for each highlighted
 * segment on each line.
 *
 * lineX     — absolute x of the text block's left edge
 * startY    — absolute y of the first line's baseline (top of first line)
 * lineHeight — px height of one line (fontSize * lineHeight)
 * align     — text alignment
 * availWidth — total width available for the text block
 */
export function computeHighlightRects(
  lines: string[],
  originalText: string,
  lineX: number,
  startY: number,
  lineHeight: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: number | string | undefined,
  align: 'left' | 'center' | 'right',
  availWidth: number,
  measureFn: (
    text: string,
    fontSize: number,
    fontFamily: string,
    fontWeight: number | string | undefined
  ) => number
): HighlightRect[] {
  const rects: HighlightRect[] = []
  const segments = parseHighlightSegments(originalText)
  if (!segments.some((s) => s.highlighted)) return rects

  // Full stripped text — lines are substrings of this
  const fullText = segments.map((s) => s.text).join('')

  // Build a sorted array of highlighted char ranges in fullText
  type Range = { start: number; end: number }
  const hlRanges: Range[] = []
  let pos = 0
  for (const seg of segments) {
    if (seg.highlighted) hlRanges.push({ start: pos, end: pos + seg.text.length })
    pos += seg.text.length
  }

  // Walk lines sequentially through fullText so each line's offset is known
  let searchFrom = 0

  lines.forEach((line, li) => {
    if (!line.trim()) return

    const lineStart = fullText.indexOf(line, searchFrom)
    if (lineStart === -1) return
    const lineEnd = lineStart + line.length
    searchFrom = lineEnd

    const lineW = measureFn(line, fontSize, fontFamily, fontWeight)
    const alignOffset =
      align === 'center' ? (availWidth - lineW) / 2 : align === 'right' ? availWidth - lineW : 0
    const lineY = startY + li * lineHeight

    for (const range of hlRanges) {
      const overlapStart = Math.max(range.start, lineStart)
      const overlapEnd = Math.min(range.end, lineEnd)
      if (overlapStart >= overlapEnd) continue

      const hlPart = line.slice(overlapStart - lineStart, overlapEnd - lineStart)
      const beforePart = line.slice(0, overlapStart - lineStart)
      const beforeW = beforePart ? measureFn(beforePart, fontSize, fontFamily, fontWeight) : 0
      const hlW = measureFn(hlPart, fontSize, fontFamily, fontWeight)

      if (hlW > 0) {
        rects.push({
          x: lineX + alignOffset + beforeW,
          y: lineY,
          w: hlW,
          h: lineHeight,
        })
      }
    }
  })

  return rects
}
