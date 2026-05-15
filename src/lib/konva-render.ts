import Konva from 'konva'
import rough from 'roughjs'
import type {
  TemplateLayout,
  TemplateElement,
  TextElement,
  ImageElement,
  RectElement,
  CarouselSlide,
  TextRole,
} from '@/types/database'
import {
  stripHighlightMarkers,
  hasHighlightMarkers,
  computeHighlightRects,
} from '@/lib/highlight-utils'

export async function renderSlideToDataUrl(
  layout: TemplateLayout,
  slide: CarouselSlide,
  backgroundUrl?: string
): Promise<string> {
  const container = document.createElement('div')
  container.style.position = 'absolute'
  container.style.left = '-99999px'
  container.style.top = '0'
  document.body.appendChild(container)

  const stage = new Konva.Stage({
    container,
    width: layout.width,
    height: layout.height,
  })

  const layer = new Konva.Layer({ listening: false })
  stage.add(layer)

  layer.add(
    new Konva.Rect({
      x: 0,
      y: 0,
      width: layout.width,
      height: layout.height,
      fill: layout.backgroundColor || '#ffffff',
      listening: false,
    })
  )

  // Only elements belonging to THIS slide type
  const visible = layout.elements
    .filter((el) => el.slideType === slide.slide_type)
    .sort((a, b) => a.zIndex - b.zIndex)

  for (const el of visible) {
    await addElement(layer, el, slide, backgroundUrl)
  }

  layer.draw()

  const dataUrl = stage.toDataURL({
    pixelRatio: 1,
    mimeType: 'image/jpeg',
    quality: 0.92,
  })

  stage.destroy()
  document.body.removeChild(container)

  return dataUrl
}

async function addElement(
  layer: Konva.Layer,
  el: TemplateElement,
  slide: CarouselSlide,
  backgroundUrl?: string
) {
  const common = {
    x: el.x,
    y: el.y,
    opacity: el.opacity ?? 1,
    listening: false,
  }

  if (el.type === 'text') {
    const t = el as TextElement
    const bgMode = t.bgMode || 'block'
    const padding = t.padding || 0
    const PARA_GAP = 6

    const textX = t.x + (bgMode === 'block' ? padding : 0)
    const textW = bgMode === 'block' ? Math.max(10, t.width - padding * 2) : t.width

    // Resolve paragraphs and pre-compute wrapped lines (used for both height calc and rendering)
    const rawParas = t.paragraphs && t.paragraphs.length > 0
      ? t.paragraphs
      : [{ role: t.role as TextRole }]

    const resolved = rawParas.map((p) => {
      // Pure spacer — no text, just vertical space
      if (p.separatorHeight && p.separatorHeight > 0) {
        return {
          isSeparator: true as const,
          spacerH: p.separatorHeight,
          rawText: '', text: '', fontFamily: t.fontFamily, fontSize: t.fontSize,
          fontWeight: t.fontWeight, color: t.color,
          align: 'left' as const, lineHeight: 1.2,
          lines: [] as string[], lh: 0, highlight: false, highlightColor: '#FFE500',
        }
      }
      const rawText = slide.text_fields?.[p.role ?? t.role] ?? ''
      const text = stripHighlightMarkers(rawText)
      const fontFamily = p.fontFamily ?? t.fontFamily
      const fontSize = p.fontSize ?? t.fontSize
      const fontWeight = p.fontWeight ?? t.fontWeight
      const lineHeight = p.lineHeight ?? t.lineHeight ?? 1.2
      const lines = text ? wrapText(text, textW, fontSize, fontFamily, fontWeight) : []
      return {
        isSeparator: false as const,
        spacerH: 0,
        rawText,
        text,
        fontFamily,
        fontSize,
        fontWeight,
        color: p.color ?? t.color,
        align: (p.align ?? t.align ?? 'left') as 'left' | 'center' | 'right',
        lineHeight,
        lines,
        lh: lineHeight * fontSize,
        highlight: p.highlight ?? false,
        highlightColor: p.highlightColor ?? '#FFE500',
        shadow: p.shadow,
      }
    })

    // Keep separators AND paragraphs that have text
    const activeParas = resolved.filter((p) => p.isSeparator || p.text)
    if (activeParas.length === 0) return

    // Actual text height (no container padding)
    // PARA_GAP is only added between two consecutive text paragraphs
    const textH = activeParas.reduce((sum, p, i) => {
      const next = activeParas[i + 1]
      if (p.isSeparator) return sum + p.spacerH
      const gap = (!p.isSeparator && next && !next.isSeparator) ? PARA_GAP : 0
      return sum + p.lines.length * p.lh + gap
    }, 0)
    const contentH = textH + (bgMode === 'block' ? padding * 2 : 0)

    // Compute actualY based on growDirection (anchor point):
    // 'down'  → top edge fixed (default anchor top)
    // 'up'    → bottom edge fixed (anchor bottom)
    // 'both'  → center fixed, grows equally up and down
    const actualH = Math.max(contentH, 1)
    const grow = t.growDirection ?? 'both'
    const actualY = grow === 'down'
      ? t.y
      : grow === 'up'
        ? Math.round(t.y + t.height - actualH)
        : Math.round(t.y + t.height / 2 - actualH / 2)

    // Block background — sized to actual content
    if (t.backgroundColor && bgMode === 'block') {
      layer.add(new Konva.Rect({
        x: t.x,
        y: actualY,
        width: t.width,
        height: actualH,
        fill: t.backgroundColor,
        opacity: t.opacity ?? 1,
        listening: false,
      }))
    }

    let curY = actualY + (bgMode === 'block' ? padding : 0)

    for (let pi = 0; pi < activeParas.length; pi++) {
      const p = activeParas[pi]
      // Pure spacer — just advance the cursor
      if (p.isSeparator) {
        curY += p.spacerH
        continue
      }
      const isBold = String(p.fontWeight || 400).includes('7')

      // Inline background — one rect per wrapped line
      if (t.backgroundColor && bgMode === 'inline') {
        p.lines.forEach((line, li) => {
          if (!line.trim()) return
          const w = measureTextWidth(line, p.fontSize, p.fontFamily, p.fontWeight)
          const lx = p.align === 'center' ? (textW - w) / 2
                   : p.align === 'right'  ? textW - w : 0
          const bx = Math.max(0, lx - padding)
          const bw = Math.min(t.width - bx, w + padding * 2)
          const bgPadV = Math.max(2, padding / 2)
          layer.add(new Konva.Rect({
            x: t.x + bx,
            y: curY + li * p.lh - bgPadV,
            width: bw,
            height: p.lh + bgPadV * 2,
            fill: t.backgroundColor,
            cornerRadius: 4,
            opacity: t.opacity ?? 1,
            listening: false,
          }))
        })
      }

      // Rough highlight rects (drawn before text so they appear behind)
      if (p.highlight && hasHighlightMarkers(p.rawText)) {
        const hRects = computeHighlightRects(
          p.lines, p.rawText,
          textX, curY, p.lh,
          p.fontSize, p.fontFamily, p.fontWeight,
          p.align, textW, measureTextWidth
        )
        if (hRects.length > 0) {
          const PAD_H = 5
          const PAD_V = 3
          const hlColor = p.highlightColor
          layer.add(new Konva.Shape({
            listening: false,
            opacity: t.opacity ?? 1,
            sceneFunc: (ctx) => {
              // eslint-disable-next-line @typescript-eslint/no-explicit-any
              const nativeCtx = (ctx as any)._context as CanvasRenderingContext2D
              const fakeCanvas = { getContext: () => nativeCtx } as unknown as HTMLCanvasElement
              const rc = rough.canvas(fakeCanvas)
              for (const r of hRects) {
                rc.rectangle(
                  r.x - PAD_H, r.y - PAD_V,
                  r.w + PAD_H * 2, r.h + PAD_V * 2,
                  {
                    fill: hlColor,
                    fillStyle: 'solid',
                    roughness: 2,
                    stroke: hlColor,
                    strokeWidth: 1,
                  }
                )
              }
            },
          }))
        }
      }

      layer.add(new Konva.Text({
        x: textX,
        y: curY,
        width: textW,
        text: p.text,
        fontSize: p.fontSize,
        fontFamily: p.fontFamily,
        fontStyle: isBold ? 'bold' : 'normal',
        fill: p.color,
        align: p.align,
        lineHeight: p.lineHeight,
        verticalAlign: 'top',
        opacity: t.opacity ?? 1,
        listening: false,
        ...(p.shadow ? {
          shadowEnabled: true,
          shadowColor: p.shadow.color,
          shadowBlur: p.shadow.blur,
          shadowOffsetX: p.shadow.offsetX,
          shadowOffsetY: p.shadow.offsetY,
          shadowOpacity: p.shadow.opacity,
        } : {}),
      }))

      const next = activeParas[pi + 1]
      const gap = next && !next.isSeparator ? PARA_GAP : 0
      curY += p.lines.length * p.lh + gap
    }
    return
  }

  if (el.type === 'image') {
    const i = el as ImageElement
    const src = i.source === 'generated' ? backgroundUrl : i.assetUrl
    if (!src) return

    const img = await loadImage(src)
    const fit = (i as ImageElement & { fit?: string }).fit ?? 'cover'

    if (fit === 'contain') {
      // Scale to fit inside the box, preserving aspect ratio (letterbox)
      const scaleX = i.width / img.naturalWidth
      const scaleY = i.height / img.naturalHeight
      const scale = Math.min(scaleX, scaleY)
      const drawW = img.naturalWidth * scale
      const drawH = img.naturalHeight * scale
      const offsetX = (i.width - drawW) / 2
      const offsetY = (i.height - drawH) / 2
      layer.add(
        new Konva.Image({
          ...common,
          x: i.x + offsetX,
          y: i.y + offsetY,
          image: img,
          width: drawW,
          height: drawH,
        })
      )
    } else {
      // fit: cover — fill the box, clip overflow
      const scaleX = i.width / img.naturalWidth
      const scaleY = i.height / img.naturalHeight
      const scale = Math.max(scaleX, scaleY)
      const drawW = img.naturalWidth * scale
      const drawH = img.naturalHeight * scale
      const offsetX = (i.width - drawW) / 2
      const offsetY = (i.height - drawH) / 2
      const group = new Konva.Group({ x: i.x, y: i.y, clipX: 0, clipY: 0, clipWidth: i.width, clipHeight: i.height, opacity: i.opacity ?? 1, listening: false })
      group.add(new Konva.Image({ x: offsetX, y: offsetY, image: img, width: drawW, height: drawH, listening: false }))
      layer.add(group)
    }
    return
  }

  if (el.type === 'rect') {
    const r = el as RectElement
    layer.add(
      new Konva.Rect({
        ...common,
        width: r.width,
        height: r.height,
        fill: r.fill,
        stroke: r.stroke,
        strokeWidth: r.strokeWidth || 0,
        cornerRadius: r.cornerRadius || 0,
      })
    )
  }
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image()
    img.crossOrigin = 'anonymous'
    img.onload = () => resolve(img)
    img.onerror = reject
    img.src = src
  })
}

export async function ensureFontsLoaded(layout: TemplateLayout): Promise<void> {
  if (typeof document === 'undefined' || !document.fonts) return
  const fonts = new Set<string>()
  for (const el of layout.elements) {
    if (el.type === 'text') {
      const t = el as TextElement
      fonts.add(`${t.fontSize}px "${t.fontFamily}"`)
      fonts.add(`bold ${t.fontSize}px "${t.fontFamily}"`)
      // Also preload per-paragraph fonts
      for (const p of t.paragraphs ?? []) {
        const ff = p.fontFamily ?? t.fontFamily
        const fs = p.fontSize ?? t.fontSize
        fonts.add(`${fs}px "${ff}"`)
        fonts.add(`bold ${fs}px "${ff}"`)
      }
    }
  }
  try {
    await Promise.all([...fonts].map((f) => document.fonts.load(f)))
    await document.fonts.ready
  } catch {
    // ignore
  }
}

// ── Text measurement / wrap helpers (shared with the builder canvas) ──────

let measureCtx: CanvasRenderingContext2D | null = null
function measureTextWidth(
  text: string,
  fontSize: number,
  fontFamily: string,
  fontWeight: number | string | undefined
): number {
  if (typeof document === 'undefined') return 0
  if (!measureCtx) {
    const canvas = document.createElement('canvas')
    measureCtx = canvas.getContext('2d')
  }
  if (!measureCtx) return 0
  const isBold = String(fontWeight || 400).includes('7')
  measureCtx.font = `${isBold ? 'bold ' : ''}${fontSize}px "${fontFamily}", sans-serif`
  return measureCtx.measureText(text).width
}

function wrapText(
  text: string,
  maxWidth: number,
  fontSize: number,
  fontFamily: string,
  fontWeight: number | string | undefined
): string[] {
  const lines: string[] = []
  const paragraphs = text.split('\n')
  for (const para of paragraphs) {
    const words = para.split(' ')
    let current = ''
    for (const word of words) {
      const candidate = current ? current + ' ' + word : word
      const w = measureTextWidth(candidate, fontSize, fontFamily, fontWeight)
      if (w <= maxWidth || !current) {
        current = candidate
      } else {
        lines.push(current)
        current = word
      }
    }
    lines.push(current)
  }
  return lines
}

// Re-export for consumers that might want it
export type { TextRole }
