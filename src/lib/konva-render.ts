import Konva from 'konva'
import type {
  TemplateLayout,
  TemplateElement,
  TextElement,
  ImageElement,
  RectElement,
  CarouselSlide,
  TextRole,
} from '@/types/database'

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

  if (layout.backgroundColor) {
    layer.add(
      new Konva.Rect({
        x: 0,
        y: 0,
        width: layout.width,
        height: layout.height,
        fill: layout.backgroundColor,
        listening: false,
      })
    )
  }

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

    // Resolve paragraphs — new model uses per-paragraph roles; legacy uses element-level role
    const rawParas = t.paragraphs && t.paragraphs.length > 0
      ? t.paragraphs
      : [{ role: t.role as TextRole }]

    const paras = rawParas.map((p) => ({
      text: slide.text_fields?.[p.role ?? t.role] ?? '',
      fontFamily: p.fontFamily ?? t.fontFamily,
      fontSize: p.fontSize ?? t.fontSize,
      fontWeight: p.fontWeight ?? t.fontWeight,
      color: p.color ?? t.color,
      align: (p.align ?? t.align ?? 'left') as 'left' | 'center' | 'right',
      lineHeight: p.lineHeight ?? t.lineHeight ?? 1.2,
    }))

    // Skip element entirely if all paragraphs are empty
    if (paras.every((p) => !p.text)) return

    const textX = t.x + (bgMode === 'block' ? padding : 0)
    const textW = bgMode === 'block' ? Math.max(10, t.width - padding * 2) : t.width

    // Block background — one rect for the whole element
    if (t.backgroundColor && bgMode === 'block') {
      layer.add(new Konva.Rect({
        ...common,
        width: t.width,
        height: t.height,
        fill: t.backgroundColor,
      }))
    }

    let curY = t.y + (bgMode === 'block' ? padding : 0)

    for (let pi = 0; pi < paras.length; pi++) {
      const p = paras[pi]
      if (!p.text) continue

      const lines = wrapText(p.text, textW, p.fontSize, p.fontFamily, p.fontWeight)
      const lh = p.lineHeight * p.fontSize
      const isBold = String(p.fontWeight || 400).includes('7')

      // Inline background — one rect per wrapped line, padding = visual margin
      if (t.backgroundColor && bgMode === 'inline') {
        lines.forEach((line, li) => {
          if (!line.trim()) return
          const w = measureTextWidth(line, p.fontSize, p.fontFamily, p.fontWeight)
          const lx = p.align === 'center' ? (textW - w) / 2
                   : p.align === 'right'  ? textW - w : 0
          const bx = Math.max(0, lx - padding)
          const bw = Math.min(t.width - bx, w + padding * 2)
          const bgPadV = Math.max(2, padding / 2)
          layer.add(new Konva.Rect({
            x: t.x + bx,
            y: curY + li * lh - bgPadV,
            width: bw,
            height: lh + bgPadV * 2,
            fill: t.backgroundColor,
            cornerRadius: 4,
            opacity: t.opacity ?? 1,
            listening: false,
          }))
        })
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
      }))

      curY += lines.length * lh + (pi < paras.length - 1 ? PARA_GAP : 0)
    }
    return
  }

  if (el.type === 'image') {
    const i = el as ImageElement
    const src = i.source === 'generated' ? backgroundUrl : i.assetUrl
    if (!src) return

    const img = await loadImage(src)
    layer.add(
      new Konva.Image({
        ...common,
        image: img,
        width: i.width,
        height: i.height,
      })
    )
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
